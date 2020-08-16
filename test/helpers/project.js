const path = require('path');
const execa = require('execa');
const npmRegistry = require('./npm-registry');
const {outputJson, outputFile} = require('fs-extra');

/**
 * @typedef {Object} Project
 * @property {string} name - Package name
 * @property {string} manifestLocation - Path to package.json
 * @property {string} lernaPath - Path to lerna.json
 * @property {(message: string) => Promise<void>} commit - Create a new git commit
 * @property {(version: string) => Promise<void>} tag - Create a new git tag
 */

/**
 * @returns {string}
 */
function generateAuthToken() {
  const content = `${npmRegistry.authEnv.NPM_USERNAME}:${npmRegistry.authEnv.NPM_PASSWORD}`;
  return Buffer.from(content, 'utf8').toString('base64');
}

/**
 * @param {string} cwd - Project directory
 * @param {string} version - Root project initial version
 * @returns {Promise<Project>}
 */
async function createProject(cwd, version) {
  const name = 'root-pkg';
  const manifestLocation = path.resolve(cwd, 'package.json');
  const lernaPath = path.resolve(cwd, 'lerna.json');
  const authToken = generateAuthToken();
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Mock user',
    GIT_AUTHOR_EMAIL: 'mock-user@example.net',
    GIT_COMMITTER_NAME: 'Mock user',
    GIT_COMMITTER_EMAIL: 'mock-user@example.net',
  };

  await outputJson(manifestLocation, {name, version: '0.0.0', publishConfig: {}});
  await outputJson(lernaPath, {version, packages: ['packages/*']});
  await outputFile(
    path.resolve(cwd, '.npmrc'),
    [
      `registry=${npmRegistry.url}`,
      `//${npmRegistry.url}:_authToken=${authToken}`,
      `_auth=${authToken}`,
      'email=${NPM_EMAIL}', // eslint-disable-line no-template-curly-in-string
    ].join('\n'),
    'utf-8'
  );
  await outputFile(path.resolve(cwd, '.gitignore'), ['node_modules'].join('\n'), 'utf-8');
  await execa('git', ['init'], {cwd, env: gitEnv});
  await execa('git', ['add', '.npmrc', '.gitignore', 'lerna.json', 'package.json'], {cwd, env: gitEnv});
  await execa('git', ['commit', '-m', 'initial commit'], {cwd, env: gitEnv});

  return {
    name,
    manifestLocation,
    lernaPath,
    async commit(message) {
      await execa('git', ['add', 'packages', 'lerna.json', 'package.json'], {cwd, env: gitEnv});
      await execa('git', ['commit', '-m', message], {cwd, env: gitEnv});
    },
    async tag(version) {
      await execa('git', ['tag', version], {cwd, env: gitEnv});
    },
  };
}

module.exports = {createProject};
