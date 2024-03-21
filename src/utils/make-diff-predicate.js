import path from "node:path/posix";
import { execaSync } from "execa";
import * as minimatch from "minimatch";

/**
 * @param {string} committish
 * @param {import("execa").SyncOptions} [execOpts]
 */
export function makeDiffPredicate(committish, execOpts, context) {
	const { ignoreChanges, logger } = context;

	const ignoreFilters = new Set(
		ignoreChanges.map((p) =>
			minimatch.filter(`!${p}`, {
				matchBase: true,
				// dotfiles inside ignored directories should also match
				dot: true,
			}),
		),
	);

	if (ignoreFilters.size) {
		logger.log("ignoring diff in paths matching", ignoreChanges);
	}

	return function hasDiffSinceThatIsntIgnored(node) {
		const diff = diffSinceIn(committish, node.location, execOpts);

		if (diff === "") {
			return false;
		}

		let changedFiles = diff.split("\n");

		if (ignoreFilters.size) {
			for (const ignored of ignoreFilters) {
				changedFiles = changedFiles.filter(ignored);
			}
		}

		if (changedFiles.length) {
			logger.log("filtered diff", changedFiles);
		} else {
			logger.log("", "no diff found in %s (after filtering)", node.name);
		}

		return changedFiles.length > 0;
	};
}

/**
 * @param {string} committish
 * @param {string} location
 * @param {import("execa").SyncOptions} [opts]
 */
function diffSinceIn(committish, location, opts) {
	const args = ["diff", "--name-only", committish];
	const formattedLocation = path.relative(opts.cwd, location);

	if (formattedLocation) {
		// avoid same-directory path.relative() === ""
		args.push("--", formattedLocation);
	}

	return execaSync("git", args, opts).stdout;
}
