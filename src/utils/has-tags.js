import { execaSync } from "execa";

/**
 * Determine if any git tags are reachable.
 * @param {import("execa").SyncOptions} [opts]
 */
export function hasTags(opts, logger) {
	let result = false;

	try {
		result = !!execaSync("git", ["tag"], opts);
	} catch (err) {
		logger.error("No git tags were reachable from this branch!");
		logger.error(`hasTags error: ${err}`);
	}

	return result;
}
