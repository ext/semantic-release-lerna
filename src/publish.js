import { createRequire } from "node:module";
import { execa } from "execa";
import getRegistry from "./get-registry.js";
import getChannel from "./get-channel.js";
import getReleaseInfo from "./get-release-info.js";

/**
 * @param {string} npmrc
 * @param {{ npmPublish: boolean}} config
 * @param {any} pkg
 * @param {any} context
 */
export default async function (npmrc, config, pkg, context) {
	const { npmPublish } = config;
	const {
		cwd,
		env,
		stdout,
		stderr,
		nextRelease: { version, channel },
		logger,
	} = context;

	if (npmPublish !== false) {
		const registry = getRegistry(pkg, context);
		const distTag = getChannel(channel);

		logger.log("Publishing version %s to npm registry", version);

		const lerna = require.resolve("lerna/cli");
		const result = execa(
			"node",
			// prettier-ignore
			[
				lerna, 'publish', 'from-package',
				'--loglevel', 'verbose',
				'--yes',
        '--concurrency', "1",
				'--no-verify-access', // prepare step has already verify access and lerna doesn't properly pass authentication
				'--dist-tag', distTag,
				'--registry', registry,
      ],
			{
				cwd,
				env: {
					...env,

					/* Lerna does not support --userconfig */
					NPM_CONFIG_USERCONFIG: npmrc,
				},
			},
		);
		result.stdout.pipe(stdout, { end: false });
		result.stderr.pipe(stderr, { end: false });
		await result;

		return getReleaseInfo(pkg, context, distTag, registry);
	}

	logger.log(`Skip publishing to npm registry as npmPublish false`);

	return false;
}
