const path = require('path');
const {format} = require('util');
const execa = require('execa');
const Project = require('@lerna/project');
const Package = require('@lerna/package');
const getChangedPackages = require('./get-changed-packages');
const {readJson} = require('fs-extra');

/**
 * Bump version in "lerna.json".
 *
 * @param {string} basePath
 * @param {any} context
 * @returns {Promise<void>}
 */
async function updateLernaJson(basePath, context) {
  const {
    logger,
    nextRelease: {version},
  } = context;
  logger.log('Write version %s to lerna.json in %s', version, basePath);
  const project = new Project(basePath);
  project.version = version;
  await project.serializeConfig();
}

/**
 * Bump version in a single package "package.json".
 *
 * @param {string} npmrc
 * @param {Package} pkg
 * @param {any} context
 * @returns {Promise<void>}
 */
async function updatePackage(npmrc, pkg, context) {
  const {
    env,
    nextRelease: {version},
    stdout,
    stderr,
    logger,
  } = context;
  logger.log('Write version %s to package.json in %s', version, pkg.location);

  /* Use "npm version" to bump version for all changed packages: "lerna version"
   * would handle this better but lerna disagrees with the tags produced by
   * semantic-release and bumps all packages. */
  const versionResult = execa(
    'npm',
    ['version', version, '--userconfig', npmrc, '--no-git-tag-version', '--allow-same-version'],
    {
      cwd: pkg.location,
      env,
    }
  );
  versionResult.stdout.pipe(stdout, {end: false});
  versionResult.stderr.pipe(stderr, {end: false});
  await versionResult;
}

/**
 * @param {string} npmrc
 * @param {any} context
 * @returns {Promise<void>}
 */
module.exports = async (npmrc, {pkgRoot}, context) => {
  const {
    cwd,
    nextRelease: {version},
    logger,
  } = context;
  const basePath = pkgRoot ? path.resolve(cwd, pkgRoot) : cwd;
  const rootPkg = new Package(readJson(path.join(basePath, 'package.json')), basePath);

  const changed = await getChangedPackages({cwd, logger, version});
  if (changed.length === 0) {
    logger.log('No packages changed, applying version bump on root package only');
    await updateLernaJson(basePath, context);
    await updatePackage(npmrc, rootPkg, context);
    return;
  }

  const s = changed.length > 1 ? 's' : '';
  logger.log(`${changed.length} package${s} need version bump: ${format(changed.map((pkg) => pkg.name))}`);

  /* Bump version in all changed packages */
  for (const pkg of changed) {
    /* Want to perform version bumps in serial, disable eslint rule warning about it */
    /* eslint-disable-next-line no-await-in-loop */
    await updatePackage(npmrc, pkg, context);
  }

  /* Bump version in "lerna.json" */
  await updateLernaJson(basePath, context);
  await updatePackage(npmrc, rootPkg, context);
};
