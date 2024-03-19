import fs from "node:fs/promises";
import path from "node:path";
import rc from "rc";
import getAuthToken from "registry-auth-token";
import nerfDart from "nerf-dart";
import AggregateError from "aggregate-error";
import getError from "./get-error.js";

export default async function (
	npmrc,
	registry,
	{ cwd, env: { NPM_TOKEN, NPM_CONFIG_USERCONFIG }, logger },
) {
	logger.log("Verify authentication for registry %s", registry);
	const { configs, ...rcConfig } = rc(
		"npm",
		{ registry: "https://registry.npmjs.org/" },
		{ config: NPM_CONFIG_USERCONFIG || path.resolve(cwd, ".npmrc") },
	);

	if (configs) {
		logger.log("Reading npm config from %s", configs.join(", "));
	}

	const currentConfig = configs
		? (await Promise.all(configs.map((config) => fs.readFile(config)))).join("\n")
		: "";

	if (getAuthToken(registry, { npmrc: rcConfig })) {
		await fs.mkdir(path.dirname(npmrc), { recursive: true });
		await fs.writeFile(npmrc, currentConfig);
		return;
	}

	if (NPM_TOKEN) {
		const oldConfig = currentConfig ? `${currentConfig}\n` : "";
		const newConfig = `${nerfDart(registry)}:_authToken = \${NPM_TOKEN}`;
		await fs.mkdir(path.dirname(npmrc), { recursive: true });
		await fs.writeFile(npmrc, `${oldConfig}${newConfig}`);
		logger.log(`Wrote NPM_TOKEN to ${npmrc}`);
	} else {
		throw new AggregateError([getError("ENONPMTOKEN", { registry })]);
	}
}
