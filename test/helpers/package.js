const path = require('path');
const execa = require('execa');
const {outputJson} = require('fs-extra');

/**
 * @typedef {Object} Package
 * @property {string} name - Package name
 * @property {string} manifestLocation - Path to package.json
 * @property {(dependency: string) => Promise<void>} require - Add a new dependency
 * @property {(...parts: string[]) => string} resolve - Resolve path inside package
 */

/**
 * @param {string} cwd - Project directory
 * @param {string} name - Package name
 * @param {string} version - Package initial version
 * @returns {Promise<Package>}
 */
async function createPackage(cwd, name, version) {
  const pkgRoot = `packages/${name}`;
  const manifestLocation = path.resolve(cwd, pkgRoot, 'package.json');
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Mock user',
    GIT_AUTHOR_EMAIL: 'mock-user@example.net',
    GIT_COMMITTER_NAME: 'Mock user',
    GIT_COMMITTER_EMAIL: 'mock-user@example.net',
  };

  await outputJson(manifestLocation, {name, version});
  await execa('git', ['add', pkgRoot], {cwd, env: gitEnv});
  await execa('git', ['commit', '-m', `add ${name} package`], {cwd, env: gitEnv});

  return {
    name,
    manifestLocation,
    async require(dep) {
      await execa('lerna', ['add', dep.name, '--scope', this.name], {cwd});
    },
    resolve(...parts) {
      return path.resolve(cwd, pkgRoot, ...parts);
    },
  };
}

module.exports = {createPackage};
