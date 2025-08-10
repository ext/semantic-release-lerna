import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync, realpathSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { jest } from "@jest/globals";
import { execa } from "execa";
import { WritableStreamBuffer } from "stream-buffers";
import * as semanticReleaseLerna from "../dist/index.js";
import * as npmRegistry from "./helpers/npm-registry";
import { createPackage, createProject, outputJson, readJson } from "./helpers";

const tempdir = realpathSync(os.tmpdir());

let context;

/**
 * @param {(testPath: string) => Promise<void>} callback
 * @returns {Promise<void>}
 */
async function withTempDir(callback) {
	const testPath = path.join(tempdir, randomBytes(16).toString("hex"));
	await fs.mkdir(testPath);
	try {
		await callback(testPath);
	} finally {
		await fs.rm(testPath, { recursive: true, force: true, maxRetries: 2 });
	}
}

async function initialPublish(cwd) {
	await execa("git", ["tag", "v0.0.0"], { cwd });
	await execa(
		"lerna",
		[
			"publish",
			"from-package",
			"--yes",
			["--loglevel", "verbose"].join("="),
			["--registry", npmRegistry.getRegistryUrl()].join("="),
		],
		{
			cwd,
			env: npmRegistry.authEnv,
		},
	);
}

/**
 * Get list of published versions for given package.
 *
 * @param {string} pkg - Package name
 * @returns {Promise<string[]>}
 */
async function getPublishedVersions(pkg) {
	/* eslint-disable-next-line n/no-unsupported-features/node-builtins -- testcases only and appears to work fine under earlier node versions */
	const response = await fetch(`${npmRegistry.getRegistryUrl()}/${pkg}`, {
		throwHttpErrors: false,
	});

	if (!response.ok) {
		return [];
	}

	const body = await response.json();
	return Object.keys(body.versions);
}

async function run(project, pluginConfig, options) {
	const generateNotes = await semanticReleaseLerna.generateNotes(pluginConfig, options);
	const prepare = await semanticReleaseLerna.prepare(pluginConfig, options);

	/* Simulate @semantic-release/git */
	await project.commit("v0.1.0");
	await project.tag("v0.1.0");

	const publish = await semanticReleaseLerna.publish(pluginConfig, options);

	return { generateNotes, prepare, publish };
}

beforeAll(async () => {
	// Start the local NPM registry
	await npmRegistry.start();

	// Let registry settle slightly (*sigh*)
	await new Promise((resolve) => setTimeout(resolve, 10000));
});

afterAll(async () => {
	// Stop the local NPM registry
	await npmRegistry.stop();
});

beforeEach(() => {
	const log = jest.fn();
	const warn = jest.fn();
	context = {
		log,
		stdout: new WritableStreamBuffer(),
		stderr: new WritableStreamBuffer(),
		logger: { log, warn },
	};
});

it("should setup testable environment", () => {
	expect.assertions(7);
	return withTempDir(async (cwd) => {
		const project = await createProject(cwd, "0.0.0");
		const foo = await createPackage(cwd, "test-initial-foo", "0.0.0");
		const bar = await createPackage(cwd, "test-initial-bar", "0.0.0");

		/* Initial publish should publish all packages */
		await initialPublish(cwd);

		/* Verify published packages */
		expect(await getPublishedVersions(project.name)).toEqual([]);
		expect(await getPublishedVersions(foo.name)).toEqual(["0.0.0"]);
		expect(await getPublishedVersions(bar.name)).toEqual(["0.0.0"]);

		/* Verify versions */
		expect(await readJson(project.manifestLocation)).toEqual(
			expect.objectContaining({ version: "0.0.0" }),
		);
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({ version: "0.0.0" }),
		);
		expect(await readJson(foo.manifestLocation)).toEqual({ name: foo.name, version: "0.0.0" });
		expect(await readJson(bar.manifestLocation)).toEqual({ name: bar.name, version: "0.0.0" });
	});
});

it("should publish only changed packages", () => {
	expect.assertions(7);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0");
		const foo = await createPackage(cwd, "test-single-foo", "0.0.0");
		const bar = await createPackage(cwd, "test-single-bar", "0.0.0");
		await initialPublish(cwd);

		/* Make change to foo package */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		await project.commit("change foo");

		/* Simulate semantic release */
		const pluginConfig = {};
		await run(project, pluginConfig, {
			cwd,
			env,
			options: {},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			nextRelease: { version: "0.0.1" },
		});

		/* Verify published packages: only foo should have been published */
		expect(await getPublishedVersions(project.name)).toEqual([]);
		expect(await getPublishedVersions(foo.name)).toEqual(["0.0.0", "0.0.1"]);
		expect(await getPublishedVersions(bar.name)).toEqual(["0.0.0"]);

		/* Verify versions */
		expect(await readJson(project.manifestLocation)).toEqual(
			expect.objectContaining({ version: "0.0.1" }),
		);
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({ version: "0.0.1" }),
		);
		expect(await readJson(foo.manifestLocation)).toEqual({ name: foo.name, version: "0.0.1" });
		expect(await readJson(bar.manifestLocation)).toEqual({ name: bar.name, version: "0.0.0" });
	});
});

it("should latch package versions", () => {
	expect.assertions(7);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0");
		const foo = await createPackage(cwd, "test-latched-foo", "0.0.0");
		const bar = await createPackage(cwd, "test-latched-bar", "0.0.0");
		await initialPublish(cwd);

		/* Make change to foo package */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		await project.commit("change foo");

		/* Simulate semantic release */
		const pluginConfig = {};
		await run(project, pluginConfig, {
			cwd,
			env,
			options: {},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			nextRelease: { version: "0.1.0" },
		});

		/* Verify published packages: only foo should have been published */
		expect(await getPublishedVersions(project.name)).toEqual([]);
		expect(await getPublishedVersions(foo.name)).toEqual(["0.0.0", "0.1.0"]);
		expect(await getPublishedVersions(bar.name)).toEqual(["0.0.0", "0.1.0"]);

		/* Verify versions */
		expect(await readJson(project.manifestLocation)).toEqual(
			expect.objectContaining({ version: "0.1.0" }),
		);
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({ version: "0.1.0" }),
		);
		expect(await readJson(foo.manifestLocation)).toEqual({ name: foo.name, version: "0.1.0" });
		expect(await readJson(bar.manifestLocation)).toEqual({ name: bar.name, version: "0.1.0" });
	});
});

it("should publish depender packages when dependee changes", () => {
	expect.assertions(7);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0", { lockfile: true, workspaces: true });
		const foo = await createPackage(cwd, "test-dependant-foo", "0.0.0", { lockfile: true });
		const bar = await createPackage(cwd, "test-dependant-bar", "0.0.0", { lockfile: true });
		await bar.require(foo);
		await project.commit("bar depends on foo");
		await initialPublish(cwd);

		/* Make change to foo package */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		await project.commit("change foo");

		/* Simulate semantic release */
		const pluginConfig = {};
		await run(project, pluginConfig, {
			cwd,
			env,
			options: {},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			nextRelease: { version: "0.1.0" },
		});

		/* Verify published packages: both foo and bar should have been published */
		expect(await getPublishedVersions(project.name)).toEqual([]);
		expect(await getPublishedVersions(foo.name)).toEqual(["0.0.0", "0.1.0"]);
		expect(await getPublishedVersions(bar.name)).toEqual(["0.0.0", "0.1.0"]);

		/* Verify versions */
		expect(await readJson(project.manifestLocation)).toEqual(
			expect.objectContaining({ version: "0.1.0" }),
		);
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({ version: "0.1.0" }),
		);
		expect(await readJson(foo.manifestLocation)).toEqual({ name: foo.name, version: "0.1.0" });
		expect(await readJson(bar.manifestLocation)).toEqual({
			name: bar.name,
			version: "0.1.0",
			dependencies: {
				[foo.name]: "^0.1.0",
			},
		});
	});
});

it("should update package-lock.json in root", () => {
	expect.assertions(1);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0", { lockfile: true });
		const foo = await createPackage(cwd, "test-root-lock-foo", "0.0.0");
		await initialPublish(cwd);

		/* Make change to foo package */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		await project.commit("change foo");

		/* Simulate semantic release */
		const pluginConfig = {};
		await run(project, pluginConfig, {
			cwd,
			env,
			options: {},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			nextRelease: { version: "0.0.1" },
		});

		/* Verify versions */
		expect(await readJson(project.lockfileLocation)).toMatchInlineSnapshot(`
			{
			  "lockfileVersion": 2,
			  "name": "root-pkg",
			  "packages": {
			    "": {
			      "name": "root-pkg",
			      "version": "0.0.1",
			    },
			  },
			  "requires": true,
			  "version": "0.0.1",
			}
		`);
	});
});

it("should update package-lock.json in root with workspaces", () => {
	expect.assertions(1);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0", { lockfile: true, workspaces: true });
		const foo = await createPackage(cwd, "test-root-workspace-foo", "0.0.0", { lockfile: true });
		const bar = await createPackage(cwd, "test-root-workspace-bar", "0.0.0", { lockfile: true });
		await bar.require(foo);
		await project.commit("bar depends on foo");
		await initialPublish(cwd);

		/* Make change to foo package */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		await project.commit("change foo");

		/* Simulate semantic release */
		const pluginConfig = {};
		await run(project, pluginConfig, {
			cwd,
			env,
			options: {},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			nextRelease: { version: "0.0.1" },
		});

		/* Verify versions */
		expect(await readJson(project.lockfileLocation)).toMatchInlineSnapshot(`
			{
			  "dependencies": {
			    "test-root-workspace-bar": {
			      "requires": {
			        "test-root-workspace-foo": "^0.0.1",
			      },
			      "version": "file:packages/test-root-workspace-bar",
			    },
			    "test-root-workspace-foo": {
			      "version": "file:packages/test-root-workspace-foo",
			    },
			  },
			  "lockfileVersion": 2,
			  "name": "root-pkg",
			  "packages": {
			    "": {
			      "name": "root-pkg",
			      "version": "0.0.1",
			      "workspaces": [
			        "packages/*",
			      ],
			    },
			    "node_modules/test-root-workspace-bar": {
			      "link": true,
			      "resolved": "packages/test-root-workspace-bar",
			    },
			    "node_modules/test-root-workspace-foo": {
			      "link": true,
			      "resolved": "packages/test-root-workspace-foo",
			    },
			    "packages/test-root-workspace-bar": {
			      "dependencies": {
			        "test-root-workspace-foo": "^0.0.1",
			      },
			      "version": "0.0.1",
			    },
			    "packages/test-root-workspace-foo": {
			      "version": "0.0.1",
			    },
			  },
			  "requires": true,
			  "version": "0.0.1",
			}
		`);
	});
});

if (process.env.ENABLE_PNPM_TESTS) {
	it("should update pnpm-lock.yaml in root", () => {
		expect.assertions(1);
		return withTempDir(async (cwd) => {
			const env = npmRegistry.authEnv;
			const project = await createProject(cwd, "0.0.0", { lockfile: true, packageManager: "pnpm" });
			const foo = await createPackage(cwd, "test-root-lock-foo", "0.0.0", {
				packageManager: "pnpm",
			});
			const bar = await createPackage(cwd, "test-root-lock-bar", "0.0.0", {
				lockfile: true,
				packageManager: "pnpm",
			});
			await bar.require(foo);
			await project.commit("bar depends on foo");
			await initialPublish(cwd);

			/* Make change to foo package */
			await outputJson(foo.resolve("file.json"), { test: 1 });
			await project.commit("change foo");

			/* Simulate semantic release */
			const pluginConfig = {};
			await run(project, pluginConfig, {
				cwd,
				env,
				options: {},
				stdout: context.stdout,
				stderr: context.stderr,
				logger: context.logger,
				nextRelease: { version: "0.0.1" },
			});

			/* Verify versions */
			expect(await readFileSync(project.lockfileLocation, { encoding: "utf8", flag: "r" }))
				.toMatchInlineSnapshot(`
		    "lockfileVersion: '9.0'

		    settings:
		      autoInstallPeers: true
		      excludeLinksFromLockfile: false

		    importers:

		      .: {}
		    "
			`);
		});
	});
} else {
	/* eslint-disable-next-line jest/no-disabled-tests, jest/no-identical-title -- conditional test, using skip to mark that this test wasn't run under this configuration */
	it.skip("should update pnpm-lock.yaml in root", () => {
		expect.assertions(1);
	});
}

if (process.env.ENABLE_PNPM_TESTS) {
	it("should update pnpm-lock.yaml in root with workspaces", () => {
		expect.assertions(1);
		return withTempDir(async (cwd) => {
			const env = npmRegistry.authEnv;
			const project = await createProject(cwd, "0.0.0", {
				lockfile: true,
				packageManager: "pnpm",
				workspaces: true,
			});
			const foo = await createPackage(cwd, "test-root-workspace-foo", "0.0.0", {
				lockfile: true,
				packageManager: "pnpm",
			});
			const bar = await createPackage(cwd, "test-root-workspace-bar", "0.0.0", {
				lockfile: true,
				packageManager: "pnpm",
			});
			await bar.require(foo);
			await project.commit("bar depends on foo");
			await initialPublish(cwd);

			/* Make change to foo package */
			await outputJson(foo.resolve("file.json"), { test: 1 });
			await project.commit("change foo");

			/* Simulate semantic release */
			const pluginConfig = {};
			await run(project, pluginConfig, {
				cwd,
				env,
				options: {},
				stdout: context.stdout,
				stderr: context.stderr,
				logger: context.logger,
				nextRelease: { version: "0.0.1" },
			});

			/* Verify versions */
			expect(readFileSync(project.lockfileLocation, { encoding: "utf8", flag: "r" }))
				.toMatchInlineSnapshot(`
		    "lockfileVersion: '9.0'

		    settings:
		      autoInstallPeers: true
		      excludeLinksFromLockfile: false

		    importers:

		      .: {}

		      packages/test-root-workspace-bar:
		        dependencies:
		          test-root-workspace-foo:
		            specifier: workspace:*
		            version: link:../test-root-workspace-foo

		      packages/test-root-workspace-foo: {}
		    "
			`);
		});
	});
} else {
	/* eslint-disable-next-line jest/no-disabled-tests, jest/no-identical-title -- conditional test, using skip to mark that this test wasn't run under this configuration */
	it.skip("should update pnpm-lock.yaml in root with workspaces", () => {
		expect.assertions(1);
	});
}

it("should generate release notes", () => {
	expect.assertions(1);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0");
		const foo = await createPackage(cwd, "test-release-notes-foo", "0.0.0");
		const bar = await createPackage(cwd, "test-release-notes-bar", "0.0.0");
		await initialPublish(cwd);

		/* Make some changes */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		const fooCommit = await project.commit("feat: change foo");
		await outputJson(project.resolve("other.json"), { test: 1 });
		const rootCommit = await project.commit("fix: fix bug");
		await outputJson(bar.resolve("file.json"), { test: 1 });
		const barCommit = await project.commit("fix: another bug fixed");
		await outputJson(foo.resolve("file.json"), { test: 2 });
		await outputJson(bar.resolve("file.json"), { test: 2 });
		const sharedCommit = await project.commit("fix: fixed bug across two packages");

		/* Simulate semantic release */
		const pluginConfig = {
			generateNotes: true,
		};
		const { generateNotes } = await run(project, pluginConfig, {
			commits: [fooCommit, rootCommit, barCommit, sharedCommit],
			cwd,
			env,
			options: {
				repositoryUrl: "https://git.example.net/test/release-notes.git",
			},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			lastRelease: { version: "0.0.0", gitTag: "v0.0.0" },
			nextRelease: { version: "0.1.0" },
		});

		const releaseNotes = generateNotes
			.replace(/\d{4}-\d{2}-\d{2}/, "1998-10-24")
			.replace(fooCommit.hash, "{{commit 1}}")
			.replace(rootCommit.hash, "{{commit 2}}")
			.replace(barCommit.hash, "{{commit 3}}")
			.replace(sharedCommit.hash, "{{commit 4}}");

		expect(releaseNotes).toMatchInlineSnapshot(`
			"# 0.1.0 (1998-10-24)


			### Bug Fixes

			* fix bug {{commit 2}}
			* **test-release-notes-bar, test-release-notes-foo:** fixed bug across two packages {{commit 4}}
			* **test-release-notes-bar:** another bug fixed {{commit 3}}


			### Features

			* **test-release-notes-foo:** change foo {{commit 1}}



			"
		`);
	});
});

it("should skip private packages in release notes", () => {
	expect.assertions(1);
	return withTempDir(async (cwd) => {
		const env = npmRegistry.authEnv;
		const project = await createProject(cwd, "0.0.0");
		const foo = await createPackage(cwd, "test-skip-private-foo", "0.0.0");
		const bar = await createPackage(cwd, "test-skip-private-bar", "0.0.0", { private: true });
		await initialPublish(cwd);

		/* Make some changes */
		await outputJson(foo.resolve("file.json"), { test: 1 });
		const fooCommit = await project.commit("feat: change foo");
		await outputJson(project.resolve("other.json"), { test: 1 });
		const rootCommit = await project.commit("fix: fix bug");
		await outputJson(bar.resolve("file.json"), { test: 1 });
		const barCommit = await project.commit("fix: another bug fixed");
		await outputJson(foo.resolve("file.json"), { test: 2 });
		await outputJson(bar.resolve("file.json"), { test: 2 });
		const sharedCommit = await project.commit("fix: fixed bug across two packages");

		/* Simulate semantic release */
		const pluginConfig = {
			generateNotes: true,
		};
		const { generateNotes } = await run(project, pluginConfig, {
			commits: [fooCommit, rootCommit, barCommit, sharedCommit],
			cwd,
			env,
			options: {
				repositoryUrl: "https://git.example.net/test/release-notes.git",
			},
			stdout: context.stdout,
			stderr: context.stderr,
			logger: context.logger,
			lastRelease: { version: "0.0.0", gitTag: "v0.0.0" },
			nextRelease: { version: "0.1.0" },
		});

		const releaseNotes = generateNotes
			.replace(/\d{4}-\d{2}-\d{2}/, "1998-10-24")
			.replace(fooCommit.hash, "{{commit 1}}")
			.replace(rootCommit.hash, "{{commit 2}}")
			.replace(barCommit.hash, "{{commit 3}}")
			.replace(sharedCommit.hash, "{{commit 4}}");

		expect(releaseNotes).toMatchInlineSnapshot(`
			"# 0.1.0 (1998-10-24)


			### Bug Fixes

			* another bug fixed {{commit 3}}
			* fix bug {{commit 2}}
			* **test-skip-private-foo:** fixed bug across two packages {{commit 4}}


			### Features

			* **test-skip-private-foo:** change foo {{commit 1}}



			"
		`);
	});
});
