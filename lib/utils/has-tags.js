import { execaSync } from "execa";
import log from "npmlog";

/**
 * Determine if any git tags are reachable.
 * @param {import("execa").SyncOptions} [opts]
 */
export function hasTags(opts) {
	log.silly("hasTags");
	let result = false;

	try {
		result = !!execaSync("git", ["tag"], opts);
	} catch (err) {
		log.warn("ENOTAGS", "No git tags were reachable from this branch!");
		log.verbose("hasTags error", err);
	}

	log.verbose("hasTags", result);

	return result;
}
