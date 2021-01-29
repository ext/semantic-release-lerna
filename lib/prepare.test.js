/* eslint-env jest */
const path = require('path');
const {outputJson, readJson} = require('fs-extra');
const tempy = require('tempy');
const execa = require('execa');
const {WritableStreamBuffer} = require('stream-buffers');
const prepare = require('./prepare');

let context;
let mockChangedPackages;

jest.mock('../lib/get-changed-packages', () => {
  function getChangedPackagesMock() {
    return mockChangedPackages;
  }

  return getChangedPackagesMock;
});

async function createProject(cwd, version) {
  const lernaPath = path.resolve(cwd, 'lerna.json');
  const manifestLocation = path.resolve(cwd, 'package.json');
  await outputJson(lernaPath, {version, packages: ['packages/*']});
  await outputJson(manifestLocation, {name: 'root-pkg', version});
  return {
    lernaPath,
    manifestLocation,
  };
}

async function createPackage(cwd, name, version, options) {
  const {changed = false} = options;
  const pkgRoot = `packages/${name}`;
  const location = path.resolve(cwd, pkgRoot);
  const manifestLocation = path.resolve(cwd, pkgRoot, 'package.json');
  const pkg = {
    name,
    location,
    manifestLocation,
    shrinkwrapPath: path.resolve(cwd, pkgRoot, 'npm-shrinkwrap.json'),
    lockfilePath: path.resolve(cwd, pkgRoot, 'package-lock.json'),
  };
  await outputJson(manifestLocation, {name, version});
  if (changed) {
    mockChangedPackages.push(pkg);
  }

  return pkg;
}

beforeEach(() => {
  const log = jest.fn();
  context = {
    log,
    logger: {log},
    stdout: new WritableStreamBuffer(),
    stderr: new WritableStreamBuffer(),
  };
  mockChangedPackages = [];
});

test('Update lerna.json and root package.json when no package has changed', async () => {
  const cwd = tempy.directory();
  const npmrc = tempy.file({name: '.npmrc'});
  const project = await createProject(cwd, '0.0.0');

  await prepare(
    npmrc,
    {},
    {
      cwd,
      env: {},
      stdout: context.stdout,
      stderr: context.stderr,
      nextRelease: {version: '1.0.0'},
      logger: context.logger,
    }
  );

  // Verify lerna.json has been updated
  await expect(readJson(project.lernaPath)).resolves.toEqual(
    expect.objectContaining({
      version: '1.0.0',
    })
  );

  // Verify root package.json has been updated
  await expect(readJson(project.manifestLocation)).resolves.toEqual(
    expect.objectContaining({
      version: '1.0.0',
    })
  );

  // Verify the logger has been called with the version updated
  expect(context.log).toHaveBeenCalledWith('No packages changed, applying version bump on root package only');
  expect(context.log).toHaveBeenCalledWith('Write version %s to lerna.json in %s', '1.0.0', cwd);
});

test('Update lerna.json and root package.json when one or more package has changed', async () => {
  const cwd = tempy.directory();
  const npmrc = tempy.file({name: '.npmrc'});
  const project = await createProject(cwd, '0.0.0');
  const pkg = await createPackage(cwd, 'foo', '0.0.0', {
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
      nextRelease: {version: '1.0.0'},
      logger: context.logger,
    }
  );

  // Verify lerna.json has been updated
  await expect(readJson(project.lernaPath)).resolves.toEqual(
    expect.objectContaining({
      version: '1.0.0',
    })
  );

  // Verify package.json has been updated
  await expect(readJson(project.manifestLocation)).resolves.toEqual(
    expect.objectContaining({
      version: '1.0.0',
    })
  );

  // Verify the logger has been called with the version updated
  expect(context.log).toHaveBeenCalledWith("1 package need version bump: [ 'foo' ]");
  expect(context.log).toHaveBeenCalledWith('Write version %s to package.json in %s', '1.0.0', pkg.location);
  expect(context.log).toHaveBeenCalledWith('Write version %s to lerna.json in %s', '1.0.0', cwd);
});

test('Update package.json in changed packages', async () => {
  const cwd = tempy.directory();
  const npmrc = tempy.file({name: '.npmrc'});
  await createProject(cwd, '0.0.0');
  const foo = await createPackage(cwd, 'foo', '0.0.0', {
    changed: true,
  });
  const bar = await createPackage(cwd, 'bar', '0.0.0', {
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
      nextRelease: {version: '1.0.0'},
      logger: context.logger,
    }
  );

  // Verify foo/package.json has been updated
  await expect(readJson(foo.manifestLocation)).resolves.toEqual({
    name: 'foo',
    version: '1.0.0',
  });

  // Verify bar/package.json has not been updated
  await expect(readJson(bar.manifestLocation)).resolves.toEqual({
    name: 'bar',
    version: '0.0.0',
  });
});

test('Update npm-shrinkwrap.json if present', async () => {
  const cwd = tempy.directory();
  const npmrc = tempy.file({name: '.npmrc'});
  await createProject(cwd, '0.0.0');
  const pkg = await createPackage(cwd, 'foo', '0.0.0', {
    changed: true,
  });
  // Create a npm-shrinkwrap.json file
  await execa('npm', ['shrinkwrap'], {cwd: pkg.location});

  await prepare(
    npmrc,
    {},
    {
      cwd,
      env: {},
      stdout: context.stdout,
      stderr: context.stderr,
      nextRelease: {version: '1.0.0'},
      logger: context.logger,
    }
  );

  // Verify foo/package.json has been updated
  await expect(readJson(pkg.manifestLocation)).resolves.toEqual({
    name: 'foo',
    version: '1.0.0',
  });

  // Verify foo/npm-shrinkwrap.json has been updated
  await expect(readJson(pkg.shrinkwrapPath)).resolves.toEqual(
    expect.objectContaining({
      lockfileVersion: expect.anything(),
      name: 'foo',
      version: '1.0.0',
    })
  );
});

test('Update package-lock.json if present', async () => {
  const cwd = tempy.directory();
  const npmrc = tempy.file({name: '.npmrc'});
  await createProject(cwd, '0.0.0');
  const pkg = await createPackage(cwd, 'foo', '0.0.0', {
    changed: true,
  });
  // Create a package-lock.json file
  await execa('npm', ['install'], {cwd: pkg.location});

  await prepare(
    npmrc,
    {},
    {
      cwd,
      env: {},
      stdout: context.stdout,
      stderr: context.stderr,
      nextRelease: {version: '1.0.0'},
      logger: context.logger,
    }
  );

  // Verify foo/package.json has been updated
  await expect(readJson(pkg.manifestLocation)).resolves.toEqual({
    name: 'foo',
    version: '1.0.0',
  });

  // Verify foo/package-lock.json has been updated
  await expect(readJson(pkg.lockfilePath)).resolves.toEqual(
    expect.objectContaining({
      lockfileVersion: expect.anything(),
      name: 'foo',
      version: '1.0.0',
    })
  );
});
