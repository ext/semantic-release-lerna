import { OFFICIAL_REGISTRY } from "../definitions/constants.js";
import exchangeToken from "./token-exchange.js";

/**
 * @param {string} registry
 */
export default async function oidcContextEstablished(registry, pkg, context) {
	return OFFICIAL_REGISTRY === registry && Boolean(await exchangeToken(pkg, context));
}
