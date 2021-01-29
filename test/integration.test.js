/* eslint-env jest */

const {outputJson, readJson} = require('fs-extra');
const execa = require('execa');
const tempy = require('tempy');
const {WritableStreamBuffer} = require('stream-buffers');
const npmRegistry = require('./helpers/npm-registry');
const got = require('got');
const {createProject} = require('./helpers/project');
const {createPackage} = require('./helpers/package');

let sut;
let context;

async function initialPublish(cwd) {
  await execa('git', ['tag', 'v0.0.0'], {cwd});
  await execa('lerna', ['publish', 'from-package', '--yes', '--loglevel', 'verbose', '--registry', npmRegistry.url], {
    cwd,
    env: npmRegistry.authEnv,
  });
}

/**
 * Get list of published versions for given package.
 *
 * @param {string} pkg - Package name
 * @returns {Promise<string[]>}
 */
async function getPublishedVersions(pkg) {
  const response = await got(`${npmRegistry.url}/${pkg}`, {
    throwHttpErrors: false,
    responseType: 'json',
  });

  if (response.statusCode === 404) {
    return [];
  }

  return Object.keys(response.body.versions);
}

async function run(project, options) {
  await sut.prepare({}, options);

  /* Simulate @semantic-release/git */
  await project.commit('v0.1.0');
  await project.tag('v0.1.0');

  await sut.publish({}, options);
}

beforeAll(async () => {
  // Start the local NPM registry
  await npmRegistry.start();
}, 30000);

afterAll(async () => {
  // Stop the local NPM registry
  await npmRegistry.stop();
}, 30000);

beforeEach(() => {
  const log = jest.fn();
  sut = require('..');
  context = {
    log,
    stdout: new WritableStreamBuffer(),
    stderr: new WritableStreamBuffer(),
    logger: {log},
  };
});

test('should setup testable environment', async () => {
  const cwd = tempy.directory();
  const project = await createProject(cwd, '0.0.0');
  const foo = await createPackage(cwd, 'test-initial-foo', '0.0.0');
  const bar = await createPackage(cwd, 'test-initial-bar', '0.0.0');

  /* Initial publish should publish all packages */
  await initialPublish(cwd);

  /* Verify published packages */
  expect(await getPublishedVersions(project.name)).toEqual([]);
  expect(await getPublishedVersions(foo.name)).toEqual(['0.0.0']);
  expect(await getPublishedVersions(bar.name)).toEqual(['0.0.0']);

  /* Verify versions */
  expect(await readJson(project.manifestLocation)).toEqual(expect.objectContaining({version: '0.0.0'}));
  expect(await readJson(project.lernaPath)).toEqual(expect.objectContaining({version: '0.0.0'}));
  expect(await readJson(foo.manifestLocation)).toEqual({name: foo.name, version: '0.0.0'});
  expect(await readJson(bar.manifestLocation)).toEqual({name: bar.name, version: '0.0.0'});
});

test('should publish only changed packages', async () => {
  const cwd = tempy.directory();
  const env = npmRegistry.authEnv;
  const project = await createProject(cwd, '0.0.0');
  const foo = await createPackage(cwd, 'test-single-foo', '0.0.0');
  const bar = await createPackage(cwd, 'test-single-bar', '0.0.0');
  await initialPublish(cwd);

  /* Make change to foo package */
  await outputJson(foo.resolve('file.json'), {test: 1});
  await project.commit('change foo');

  /* Simulate semantic release */
  await run(project, {
    cwd,
    env,
    options: {},
    stdout: context.stdout,
    stderr: context.stderr,
    logger: context.logger,
    nextRelease: {version: '0.1.0'},
  });

  /* Verify published packages: only foo should have been published */
  expect(await getPublishedVersions(project.name)).toEqual([]);
  expect(await getPublishedVersions(foo.name)).toEqual(['0.0.0', '0.1.0']);
  expect(await getPublishedVersions(bar.name)).toEqual(['0.0.0']);

  /* Verify versions */
  expect(await readJson(project.manifestLocation)).toEqual(expect.objectContaining({version: '0.1.0'}));
  expect(await readJson(project.lernaPath)).toEqual(expect.objectContaining({version: '0.1.0'}));
  expect(await readJson(foo.manifestLocation)).toEqual({name: foo.name, version: '0.1.0'});
  expect(await readJson(bar.manifestLocation)).toEqual({name: bar.name, version: '0.0.0'});
});

test('should publish depender packages when dependee changes', async () => {
  const cwd = tempy.directory();
  const env = npmRegistry.authEnv;
  const project = await createProject(cwd, '0.0.0');
  const foo = await createPackage(cwd, 'test-dependant-foo', '0.0.0');
  const bar = await createPackage(cwd, 'test-dependant-bar', '0.0.0');
  await bar.require(foo);
  await project.commit('bar depends on foo');
  await initialPublish(cwd);

  /* Make change to foo package */
  await outputJson(foo.resolve('file.json'), {test: 1});
  await project.commit('change foo');

  /* Simulate semantic release */
  await run(project, {
    cwd,
    env,
    options: {},
    stdout: context.stdout,
    stderr: context.stderr,
    logger: context.logger,
    nextRelease: {version: '0.1.0'},
  });

  /* Verify published packages: both foo and bar should have been published */
  expect(await getPublishedVersions(project.name)).toEqual([]);
  expect(await getPublishedVersions(foo.name)).toEqual(['0.0.0', '0.1.0']);
  expect(await getPublishedVersions(bar.name)).toEqual(['0.0.0', '0.1.0']);

  /* Verify versions */
  expect(await readJson(project.manifestLocation)).toEqual(expect.objectContaining({version: '0.1.0'}));
  expect(await readJson(project.lernaPath)).toEqual(expect.objectContaining({version: '0.1.0'}));
  expect(await readJson(foo.manifestLocation)).toEqual({name: foo.name, version: '0.1.0'});
  expect(await readJson(bar.manifestLocation)).toEqual({
    name: bar.name,
    version: '0.1.0',
    dependencies: {
      [foo.name]: '^0.1.0',
    },
  });
});
