const {format} = require('util');
const PackageGraph = require('@lerna/package-graph');
const Project = require('@lerna/project');
const childProcess = require('@lerna/child-process');
const hasTags = require('@lerna/collect-updates/lib/has-tags');
const collectPackages = require('@lerna/collect-updates/lib/collect-packages');
const makeDiffPredicate = require('@lerna/collect-updates/lib/make-diff-predicate');

function describeRefSync(execOptions) {
  const args = [
    'describe',
    '--tags',
    // Fallback to short sha if no tags located
    '--always',
    // Always return full result, helps identify existing release
    '--long',
    // Annotate if uncommitted changes present
    '--dirty',
    // Prefer tags originating on upstream branch
    '--first-parent',
  ];
  const stdout = childProcess.execSync('git', args, execOptions);
  return parse(stdout, execOptions);
}

function parse(stdout, options = {}) {
  const minimalShaRegex = /^([\da-f]{7,40})(-dirty)?$/;
  // When git describe fails to locate tags, it returns only the minimal sha
  if (minimalShaRegex.test(stdout)) {
    // Repo might still be dirty
    const [, sha, isDirty] = minimalShaRegex.exec(stdout);

    // Count number of commits since beginning of time
    const refCount = childProcess.execSync('git', ['rev-list', '--count', sha], options);

    return {refCount, sha, isDirty: Boolean(isDirty)};
  }

  const [, lastTagName, lastVersion, refCount, sha, isDirty] =
    /^((?:.*@)?(.*))-(\d+)-g([\da-f]+)(-dirty)?$/.exec(stdout) || [];

  return {lastTagName, lastVersion, refCount, sha, isDirty: Boolean(isDirty)};
}

function collectUpdates(filteredPackages, packageGraph, execOptions, commandOptions) {
  const {version, logger} = commandOptions;

  const packages =
    filteredPackages.length === packageGraph.size
      ? packageGraph
      : new Map(filteredPackages.map(({name}) => [name, packageGraph.get(name)]));

  let committish;

  if (hasTags(execOptions)) {
    // Describe the last annotated tag in the current branch
    const {refCount, lastTagName} = describeRefSync(execOptions, false);

    if (refCount === '0' && !committish) {
      // No commits since previous release
      logger.warn('', 'Current HEAD is already released, skipping change detection.');

      return [];
    }

    // If no tags found, this will be undefined and we'll use the initial commit
    committish = lastTagName;
  }

  const major = version.match(/^\d+\.0\.0$/);
  if (major) {
    logger.log('Bumping all packages because this is a major release');
    return collectPackages(packages);
  }

  if (!committish) {
    logger.log('Failed to find last release tag, assuming all packages changed');
    return collectPackages(packages);
  }

  logger.log(`Looking for changed packages since ${committish}`);

  const hasDiff = makeDiffPredicate(committish, execOptions, commandOptions.ignoreChanges);

  return collectPackages(packages, {
    isCandidate: (node) => hasDiff(node),
  });
}

/**
 * @param {any} context
 * @returns {Promise<any[]>}
 */
async function getChangedPackages(context) {
  const {cwd, logger, version} = context;
  const project = new Project(cwd);
  const packages = await project.getPackages();
  const packageGraph = new PackageGraph(packages);
  logger.log(
    `%d package${packages.length === 1 ? '' : 's'} found: %s`,
    packages.length,
    format(packages.map((pkg) => pkg.name))
  );

  const updates = collectUpdates(packageGraph.rawPackageList, packageGraph, {cwd}, {logger, version});
  const changedProjects = updates.map((node) => packages.find((pkg) => pkg.name === node.name));

  return changedProjects;
}

module.exports = getChangedPackages;
