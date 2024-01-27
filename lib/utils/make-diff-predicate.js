import path from "node:path/posix";
import { execaSync } from "execa";
import log from "npmlog";
import * as minimatch from "minimatch";

/**
 * @param {string} committish
 * @param {import("execa").SyncOptions} [execOpts]
 * @param {string[]} ignorePatterns
 */
export function makeDiffPredicate(committish, execOpts, ignorePatterns = []) {
	const ignoreFilters = new Set(
		ignorePatterns.map((p) =>
			minimatch.filter(`!${p}`, {
				matchBase: true,
				// dotfiles inside ignored directories should also match
				dot: true,
			}),
		),
	);

	if (ignoreFilters.size) {
		log.info("ignoring diff in paths matching", ignorePatterns);
	}

	return function hasDiffSinceThatIsntIgnored(node) {
		const diff = diffSinceIn(committish, node.location, execOpts);

		if (diff === "") {
			log.silly("", "no diff found in %s", node.name);
			return false;
		}

		log.silly("found diff in", diff);
		let changedFiles = diff.split("\n");

		if (ignoreFilters.size) {
			for (const ignored of ignoreFilters) {
				changedFiles = changedFiles.filter(ignored);
			}
		}

		if (changedFiles.length) {
			log.verbose("filtered diff", changedFiles);
		} else {
			log.verbose("", "no diff found in %s (after filtering)", node.name);
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

	log.silly("checking diff", formattedLocation);
	return execaSync("git", args, opts).stdout;
}
