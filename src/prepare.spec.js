import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { WritableStreamBuffer } from "stream-buffers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prepare from "./prepare.js";

let context;
const mockState = {
	changedPackages: [],
	useRealGetChangedPackages: false,
};

const tempdir = realpathSync(os.tmpdir());

vi.mock(import("./get-changed-packages.js"), async (importOriginal) => {
	const { default: original } = await importOriginal();
	return {
		default(...args) {
			if (!mockState.useRealGetChangedPackages) {
				return mockState.changedPackages;
			}
			return original(...args);
		},
	};
});

async function outputFile(file, data) {
	const dir = path.dirname(file);
	if (!existsSync(dir)) {
		await fs.mkdir(dir, { recursive: true });
	}
	await fs.writeFile(file, data, "utf-8");
}

async function outputJson(file, data) {
	const str = JSON.stringify(data);
	await outputFile(file, `${str}\n`);
}

async function readJson(file) {
	const content = await fs.readFile(file, "utf-8");
	return JSON.parse(content);
}

/**
 * @returns {Promise<string>}
 */
async function temporaryDirectory() {
	const testPath = path.join(tempdir, randomBytes(16).toString("hex"));
	await fs.mkdir(testPath);
	return testPath;
}

/**
 * @param {{ name: string }}  options
 * @returns {Promise<string>}
 */
async function temporaryFile(options) {
	const { name } = options;
	return path.join(await temporaryDirectory(), name);
}

/**
 * @param {(testPath: string) => Promise<void>} callback
 * @returns {Promise<void>}
 */
async function withTempDir(callback) {
	const testPath = await temporaryDirectory();
	try {
		await callback(testPath);
	} finally {
		await fs.rm(testPath, { recursive: true, force: true, maxRetries: 2 });
	}
}

async function createProject(cwd, version, pkgData) {
	const lernaPath = path.resolve(cwd, "lerna.json");
	const manifestLocation = path.resolve(cwd, "package.json");
	await outputJson(lernaPath, { version, packages: ["packages/*"] });
	await outputJson(manifestLocation, { name: "root-pkg", version, ...pkgData });
	return {
		lernaPath,
		manifestLocation,
	};
}

async function createPackage(cwd, name, version, options, pkgData) {
	const { changed = false } = options;
	const pkgRoot = `packages/${name}`;
	const location = path.resolve(cwd, pkgRoot);
	const manifestLocation = path.resolve(cwd, pkgRoot, "package.json");
	const pkg = {
		name,
		location,
		manifestLocation,
		shrinkwrapPath: path.resolve(cwd, pkgRoot, "npm-shrinkwrap.json"),
		lockfilePath: path.resolve(cwd, pkgRoot, "package-lock.json"),
	};
	await outputJson(manifestLocation, { name, version, ...pkgData });
	if (changed) {
		mockState.changedPackages.push(pkg);
	}

	return pkg;
}

beforeEach(() => {
	const log = vi.fn();
	context = {
		log,
		logger: { log },
		stdout: new WritableStreamBuffer(),
		stderr: new WritableStreamBuffer(),
	};
	mockState.changedPackages = [];
	mockState.useRealGetChangedPackages = false;
});

it("Update lerna.json and root package.json when no package has changed", async () => {
	expect.assertions(4);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		const project = await createProject(cwd, "0.0.0");

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "1.0.0" },
				logger: context.logger,
			},
		);

		// Verify lerna.json has been updated
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({
				version: "1.0.0",
			}),
		);

		// Verify root package.json has been updated
		expect(await readJson(project.manifestLocation)).toEqual(
			expect.objectContaining({
				version: "1.0.0",
			}),
		);

		// Verify the logger has been called with the version updated
		expect(context.log).toHaveBeenCalledWith(
			"No packages changed, applying version bump on root package only",
		);
		expect(context.log).toHaveBeenCalledWith("Write version %s to lerna.json in %s", "1.0.0", cwd);
	});
});

it("Update lerna.json and root package.json when one or more package has changed", async () => {
	expect.assertions(5);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		const project = await createProject(cwd, "0.0.0");
		const pkg = await createPackage(cwd, "foo", "0.0.0", {
			changed: true,
		});

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "1.0.0" },
				logger: context.logger,
			},
		);

		// Verify lerna.json has been updated
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({
				version: "1.0.0",
			}),
		);

		// Verify package.json has been updated
		expect(await readJson(project.manifestLocation)).toEqual(
			expect.objectContaining({
				version: "1.0.0",
			}),
		);

		// Verify the logger has been called with the version updated
		expect(context.log).toHaveBeenCalledWith("1 package need version bump: [ 'foo' ]");
		expect(context.log).toHaveBeenCalledWith(
			"Write version %s to package.json in %s",
			"1.0.0",
			pkg.location,
		);
		expect(context.log).toHaveBeenCalledWith("Write version %s to lerna.json in %s", "1.0.0", cwd);
	});
});

it("Update only lerna.json when one or more package has changed when option `rootVersion` is `false`", async () => {
	expect.assertions(4);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		const project = await createProject(cwd, "0.0.0");

		await createPackage(cwd, "foo", "0.0.0", {
			changed: true,
		});

		await prepare(
			npmrc,
			{
				rootVersion: false,
			},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "1.0.0" },
				logger: context.logger,
			},
		);

		// Verify lerna.json has been updated
		expect(await readJson(project.lernaPath)).toEqual(
			expect.objectContaining({
				version: "1.0.0",
			}),
		);

		// Verify the logger has been called with the version updated
		expect(context.log).toHaveBeenCalledWith("1 package need version bump: [ 'foo' ]");
		expect(context.log).toHaveBeenCalledWith("Write version %s to lerna.json in %s", "1.0.0", cwd);
		expect(context.log).toHaveBeenCalledWith("Don't write version to root package.json");
	});
});

it("Update package.json in changed packages", async () => {
	expect.assertions(2);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "0.0.0");
		const foo = await createPackage(cwd, "foo", "0.0.0", {
			changed: true,
		});
		const bar = await createPackage(cwd, "bar", "0.0.0", {
			changed: false,
		});

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "1.0.0" },
				logger: context.logger,
			},
		);

		// Verify foo/package.json has been updated
		expect(await readJson(foo.manifestLocation)).toEqual({
			name: "foo",
			version: "1.0.0",
		});

		// Verify bar/package.json has not been updated
		expect(await readJson(bar.manifestLocation)).toEqual({
			name: "bar",
			version: "0.0.0",
		});
	});
});

it("Update package-lock.json if present", async () => {
	expect.assertions(2);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "0.0.0");
		const pkg = await createPackage(cwd, "foo", "0.0.0", {
			changed: true,
		});
		// Create a package-lock.json file
		await execa("npm", ["install"], { cwd: pkg.location });

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "1.0.0" },
				logger: context.logger,
			},
		);

		// Verify foo/package.json has been updated
		expect(await readJson(pkg.manifestLocation)).toEqual({
			name: "foo",
			version: "1.0.0",
		});

		// Verify foo/package-lock.json has been updated
		expect(await readJson(pkg.lockfilePath)).toEqual(
			expect.objectContaining({
				lockfileVersion: expect.anything(),
				name: "foo",
				version: "1.0.0",
			}),
		);
	});
});

it("Update package.json dependency when using exact version", async () => {
	expect.assertions(1);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "0.0.0");
		const foo = await createPackage(
			cwd,
			"foo",
			"0.0.0",
			{
				changed: true,
			},
			{
				dependencies: {
					a: "0.0.0",
				},
				devDependencies: {
					b: "0.0.0",
				},
				peerDependencies: {
					c: "0.0.0",
				},
			},
		);
		await createPackage(cwd, "a", "0.0.0", { changed: true });
		await createPackage(cwd, "b", "0.0.0", { changed: true });
		await createPackage(cwd, "c", "0.0.0", { changed: true });

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "0.0.1" },
				logger: context.logger,
			},
		);

		// Verify dependency has been updated
		expect(await readJson(foo.manifestLocation)).toEqual({
			name: "foo",
			version: "0.0.1",
			dependencies: {
				a: "0.0.1",
			},
			devDependencies: {
				b: "0.0.1",
			},
			peerDependencies: {
				c: "0.0.1",
			},
		});
	});
});

it("Update package.json dependency when using hat", async () => {
	expect.assertions(1);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "0.1.2");
		const foo = await createPackage(
			cwd,
			"foo",
			"0.1.2",
			{
				changed: true,
			},
			{
				dependencies: {
					a: "^0.1.2",
					b: "^0.1",
					c: "^0",
				},
			},
		);

		await createPackage(cwd, "a", "0.1.2", { changed: true });
		await createPackage(cwd, "b", "0.1.2", { changed: true });
		await createPackage(cwd, "c", "0.1.2", { changed: true });

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "1.0.0" },
				logger: context.logger,
			},
		);

		// Verify dependency has been updated
		expect(await readJson(foo.manifestLocation)).toEqual({
			name: "foo",
			version: "1.0.0",
			dependencies: {
				a: "^1.0.0",
				b: "^1.0",
				c: "^1",
			},
		});
	});
});

it("Update package.json dependency when new version is out of range", async () => {
	expect.assertions(1);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "1.2.3");
		const foo = await createPackage(
			cwd,
			"foo",
			"1.2.3",
			{
				changed: true,
			},
			{
				dependencies: {
					a: "^1.1.0",
					b: "^1.1",
					c: "^1",
				},
			},
		);

		await createPackage(cwd, "a", "1.2.3", { changed: true });
		await createPackage(cwd, "b", "1.2.3", { changed: true });
		await createPackage(cwd, "c", "1.2.3", { changed: true });

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "2.0.0" },
				logger: context.logger,
			},
		);

		// Verify dependency has been updated
		expect(await readJson(foo.manifestLocation)).toEqual({
			name: "foo",
			version: "2.0.0",
			dependencies: {
				a: "^2.0.0",
				b: "^2.0",
				c: "^2",
			},
		});
	});
});

it("Should not update other dependencies", async () => {
	expect.assertions(1);
	await withTempDir(async (cwd) => {
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "0.0.0");
		const foo = await createPackage(
			cwd,
			"foo",
			"0.0.0",
			{
				changed: true,
			},
			{
				dependencies: {
					a: "0.0.0",
				},
			},
		);

		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "0.0.1" },
				logger: context.logger,
			},
		);

		// Verify dependency has been updated
		expect(await readJson(foo.manifestLocation)).toEqual({
			name: "foo",
			version: "0.0.1",
			dependencies: {
				a: "0.0.0",
			},
		});
	});
});

it("Handle dependencies from root package", async () => {
	expect.assertions(1);
	const cwd = await temporaryDirectory();
	const npmrc = await temporaryFile({ name: ".npmrc" });
	await createProject(cwd, "0.0.1", {
		devDependencies: {
			"external-dependency": "1.2.3",
		},
	});
	const result = prepare(
		npmrc,
		{},
		{
			cwd,
			env: {},
			stdout: context.stdout,
			stderr: context.stderr,
			nextRelease: { version: "0.0.2" },
			logger: context.logger,
		},
	);
	await expect(result).resolves.toBeUndefined();
});

describe("getChangedPackages", () => {
	beforeEach(() => {
		mockState.useRealGetChangedPackages = true;
	});

	it("should run without any reference error if the repository has not yet any tag", async () => {
		expect.assertions(1);
		const cwd = await temporaryDirectory();
		const npmrc = await temporaryFile({ name: ".npmrc" });
		await createProject(cwd, "0.0.1", {
			devDependencies: {
				"external-dependency": "1.2.3",
			},
		});

		await createPackage(
			cwd,
			"foo",
			"0.0.0",
			{
				changed: true,
			},
			{
				dependencies: {
					a: "0.0.0",
				},
			},
		);

		await execa("git", ["init"], { cwd });
		await execa("git", ["config", "--local", "user.email", "you@example.com"], { cwd });
		await execa("git", ["config", "--local", "user.name", "Sample User"], { cwd });
		await execa("git", ["add", "."], { cwd });
		await execa("git", ["commit", "-m", "'feat:initial commit'"], { cwd });

		await execa("touch", ["test.txt"], { cwd });
		await execa("git", ["add", "."], { cwd });
		await execa("git", ["commit", "-m", "'fix:commit msg'"], { cwd });

		const result = prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "0.0.2" },
				logger: context.logger,
			},
		);
		await expect(result).resolves.toBeUndefined();
	});
});
