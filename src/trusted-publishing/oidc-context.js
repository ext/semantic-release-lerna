import { OFFICIAL_REGISTRY } from "../definitions/constants.js";
import exchangeToken from "./token-exchange.js";

/**
 * @param {string} registry
 * @param {import("../lerna/package.js").Package[]} packages - List of packages to verify auth for.
 * @returns {Promise<boolean>}
 */
export default async function oidcContextEstablished(registry, packages, context) {
	if (OFFICIAL_REGISTRY !== registry) {
		return false;
	}

	if (packages.length === 0) {
		return false;
	}

	for (const pkg of packages) {
		const ok = await exchangeToken(pkg, context);
		if (!ok) {
			return false;
		}
	}
	return true;
}
