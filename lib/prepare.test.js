/* eslint-env jest */
const path = require("path");
const { outputJson, readJson } = require("fs-extra");
const tempy = require("tempy");
const execa = require("execa");
const { WritableStreamBuffer } = require("stream-buffers");
const prepare = require("./prepare");

let context;
let mockChangedPackages;

jest.mock("../lib/get-changed-packages", () => {
	function getChangedPackagesMock() {
		return mockChangedPackages;
	}

	return getChangedPackagesMock;
});

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

/* eslint-disable-next-line max-params */
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
		mockChangedPackages.push(pkg);
	}

	return pkg;
}

beforeEach(() => {
	const log = jest.fn();
	context = {
		log,
		logger: { log },
		stdout: new WritableStreamBuffer(),
		stderr: new WritableStreamBuffer(),
	};
	mockChangedPackages = [];
});

it("Update lerna.json and root package.json when no package has changed", async () => {
	expect.assertions(4);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
	);

	// Verify lerna.json has been updated
	expect(await readJson(project.lernaPath)).toEqual(
		expect.objectContaining({
			version: "1.0.0",
		})
	);

	// Verify root package.json has been updated
	expect(await readJson(project.manifestLocation)).toEqual(
		expect.objectContaining({
			version: "1.0.0",
		})
	);

	// Verify the logger has been called with the version updated
	expect(context.log).toHaveBeenCalledWith(
		"No packages changed, applying version bump on root package only"
	);
	expect(context.log).toHaveBeenCalledWith("Write version %s to lerna.json in %s", "1.0.0", cwd);
});

it("Update lerna.json and root package.json when one or more package has changed", async () => {
	expect.assertions(5);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
	);

	// Verify lerna.json has been updated
	expect(await readJson(project.lernaPath)).toEqual(
		expect.objectContaining({
			version: "1.0.0",
		})
	);

	// Verify package.json has been updated
	expect(await readJson(project.manifestLocation)).toEqual(
		expect.objectContaining({
			version: "1.0.0",
		})
	);

	// Verify the logger has been called with the version updated
	expect(context.log).toHaveBeenCalledWith("1 package need version bump: [ 'foo' ]");
	expect(context.log).toHaveBeenCalledWith(
		"Write version %s to package.json in %s",
		"1.0.0",
		pkg.location
	);
	expect(context.log).toHaveBeenCalledWith("Write version %s to lerna.json in %s", "1.0.0", cwd);
});

it("Update only lerna.json when one or more package has changed when option `rootVersion` is `false`", async () => {
	expect.assertions(4);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
	);

	// Verify lerna.json has been updated
	expect(await readJson(project.lernaPath)).toEqual(
		expect.objectContaining({
			version: "1.0.0",
		})
	);

	// Verify the logger has been called with the version updated
	expect(context.log).toHaveBeenCalledWith("1 package need version bump: [ 'foo' ]");
	expect(context.log).toHaveBeenCalledWith("Write version %s to lerna.json in %s", "1.0.0", cwd);
	expect(context.log).toHaveBeenCalledWith("Don't write version to root package.json");
});

it("Update package.json in changed packages", async () => {
	expect.assertions(2);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
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

it("Update npm-shrinkwrap.json if present", async () => {
	expect.assertions(2);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
	await createProject(cwd, "0.0.0");
	const pkg = await createPackage(cwd, "foo", "0.0.0", {
		changed: true,
	});
	// Create a npm-shrinkwrap.json file
	await execa("npm", ["shrinkwrap"], { cwd: pkg.location });

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
		}
	);

	// Verify foo/package.json has been updated
	expect(await readJson(pkg.manifestLocation)).toEqual({
		name: "foo",
		version: "1.0.0",
	});

	// Verify foo/npm-shrinkwrap.json has been updated
	expect(await readJson(pkg.shrinkwrapPath)).toEqual(
		expect.objectContaining({
			lockfileVersion: expect.anything(),
			name: "foo",
			version: "1.0.0",
		})
	);
});

it("Update package-lock.json if present", async () => {
	expect.assertions(2);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
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
		})
	);
});

it("Update package.json dependency when using exact version", async () => {
	expect.assertions(1);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
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
		}
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

it("Update package.json dependency when using hat", async () => {
	expect.assertions(1);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
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
		}
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

it("Should not update other dependencies", async () => {
	expect.assertions(1);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
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
		}
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
		}
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

it("Handle dependencies from root package", async () => {
	expect.assertions(1);
	const cwd = tempy.directory();
	const npmrc = tempy.file({ name: ".npmrc" });
	await createProject(cwd, "0.0.1", {
		devDependencies: {
			"external-dependency": "1.2.3",
		},
	});
	expect(async () => {
		await prepare(
			npmrc,
			{},
			{
				cwd,
				env: {},
				stdout: context.stdout,
				stderr: context.stderr,
				nextRelease: { version: "0.0.2" },
				logger: context.logger,
			}
		);
	}).not.toThrow();
});
