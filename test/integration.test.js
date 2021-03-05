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
  await execa('lerna', ['publish', 'from-package', '--yes', '--loglevel', 'verbose', '--registry', npmRegistry.url()], {
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
  const response = await got(`${npmRegistry.url()}/${pkg}`, {
    throwHttpErrors: false,
    responseType: 'json',
  });

  if (response.statusCode === 404) {
    return [];
  }

  return Object.keys(response.body.versions);
}

async function run(project, pluginConfig, options) {
  const generateNotes = await sut.generateNotes(pluginConfig, options);
  const prepare = await sut.prepare(pluginConfig, options);

  /* Simulate @semantic-release/git */
  await project.commit('v0.1.0');
  await project.tag('v0.1.0');

  const publish = await sut.publish(pluginConfig, options);

  return {generateNotes, prepare, publish};
}

beforeAll(async () => {
  // Start the local NPM registry
  await npmRegistry.start();
});

afterAll(async () => {
  // Stop the local NPM registry
  await npmRegistry.stop();
});

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
  const pluginConfig = {};
  await run(project, pluginConfig, {
    cwd,
    env,
    options: {},
    stdout: context.stdout,
    stderr: context.stderr,
    logger: context.logger,
    nextRelease: {version: '0.0.1'},
  });

  /* Verify published packages: only foo should have been published */
  expect(await getPublishedVersions(project.name)).toEqual([]);
  expect(await getPublishedVersions(foo.name)).toEqual(['0.0.0', '0.0.1']);
  expect(await getPublishedVersions(bar.name)).toEqual(['0.0.0']);

  /* Verify versions */
  expect(await readJson(project.manifestLocation)).toEqual(expect.objectContaining({version: '0.0.1'}));
  expect(await readJson(project.lernaPath)).toEqual(expect.objectContaining({version: '0.0.1'}));
  expect(await readJson(foo.manifestLocation)).toEqual({name: foo.name, version: '0.0.1'});
  expect(await readJson(bar.manifestLocation)).toEqual({name: bar.name, version: '0.0.0'});
});

test('should latch package versions', async () => {
  const cwd = tempy.directory();
  const env = npmRegistry.authEnv;
  const project = await createProject(cwd, '0.0.0');
  const foo = await createPackage(cwd, 'test-latched-foo', '0.0.0');
  const bar = await createPackage(cwd, 'test-latched-bar', '0.0.0');
  await initialPublish(cwd);

  /* Make change to foo package */
  await outputJson(foo.resolve('file.json'), {test: 1});
  await project.commit('change foo');

  /* Simulate semantic release */
  const pluginConfig = {};
  await run(project, pluginConfig, {
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
  expect(await getPublishedVersions(bar.name)).toEqual(['0.0.0', '0.1.0']);

  /* Verify versions */
  expect(await readJson(project.manifestLocation)).toEqual(expect.objectContaining({version: '0.1.0'}));
  expect(await readJson(project.lernaPath)).toEqual(expect.objectContaining({version: '0.1.0'}));
  expect(await readJson(foo.manifestLocation)).toEqual({name: foo.name, version: '0.1.0'});
  expect(await readJson(bar.manifestLocation)).toEqual({name: bar.name, version: '0.1.0'});
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
  const pluginConfig = {};
  await run(project, pluginConfig, {
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

test('should generate release notes', async () => {
  const cwd = tempy.directory();
  const env = npmRegistry.authEnv;
  const project = await createProject(cwd, '0.0.0');
  const foo = await createPackage(cwd, 'test-release-notes-foo', '0.0.0');
  const bar = await createPackage(cwd, 'test-release-notes-bar', '0.0.0');
  await initialPublish(cwd);

  /* Make some changes */
  await outputJson(foo.resolve('file.json'), {test: 1});
  const fooCommit = await project.commit('feat: change foo');
  await outputJson(project.resolve('other.json'), {test: 1});
  const rootCommit = await project.commit('fix: fix bug');
  await outputJson(bar.resolve('file.json'), {test: 1});
  const barCommit = await project.commit('fix: another bug fixed');

  /* Simulate semantic release */
  const pluginConfig = {
    generateNotes: true,
  };
  const {generateNotes} = await run(project, pluginConfig, {
    commits: [fooCommit, rootCommit, barCommit],
    cwd,
    env,
    options: {
      repositoryUrl: 'https://git.example.net/test/release-notes.git',
    },
    stdout: context.stdout,
    stderr: context.stderr,
    logger: context.logger,
    lastRelease: {version: '0.0.0', gitTag: 'v0.0.0'},
    nextRelease: {version: '0.1.0'},
  });

  const releaseNotes = generateNotes
    .replace(/\d{4}-\d{2}-\d{2}/, '1998-10-24')
    .replace(fooCommit.hash, '{{commit 1}}')
    .replace(rootCommit.hash, '{{commit 2}}')
    .replace(barCommit.hash, '{{commit 3}}');

  expect(releaseNotes).toMatchInlineSnapshot(`
    "# 0.1.0 (1998-10-24)


    ### Bug Fixes

    * fix bug {{commit 2}}
    * **test-release-notes-bar:** another bug fixed {{commit 3}}


    ### Features

    * **test-release-notes-foo:** change foo {{commit 1}}



    "
  `);
});
