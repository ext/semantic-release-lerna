const execa = require('execa');
const getRegistry = require('@semantic-release/npm/lib/get-registry');
const getChannel = require('@semantic-release/npm/lib/get-channel');
const getReleaseInfo = require('@semantic-release/npm/lib/get-release-info');

/**
 * @param {string} npmrc
 * @param {{ npmPublish: boolean}} config
 * @param {any} pkg
 * @param {any} context
 */
module.exports = async (npmrc, config, pkg, context) => {
  const {npmPublish} = config;
  const {
    cwd,
    env,
    stdout,
    stderr,
    nextRelease: {version, channel},
    logger,
  } = context;

  if (npmPublish !== false) {
    const registry = getRegistry(pkg, context);
    const distTag = getChannel(channel);

    logger.log('Publishing version %s to npm registry', version);

    let legacyAuth = [];
    if (env.NPM_USERNAME && env.NPM_PASSWORD && env.NPM_EMAIL) {
      legacyAuth = ['--legacy-auth', Buffer.from(`${env.NPM_USERNAME}:${env.NPM_PASSWORD}`, 'utf8').toString('base64')];
    }

    const lerna = require.resolve('lerna/cli');
    const result = execa(
      'node',
      // prettier-ignore
      [
        lerna, 'publish', 'from-package',
        '--loglevel', 'verbose',
        '--yes',
        '--dist-tag', distTag,
        '--registry', registry,
        ...legacyAuth,
      ],
      {cwd, env}
    );
    result.stdout.pipe(stdout, {end: false});
    result.stderr.pipe(stderr, {end: false});
    await result;

    return getReleaseInfo(pkg, context, distTag, registry);
  }

  logger.log(`Skip publishing to npm registry as npmPublish false`);

  return false;
};
