import AggregateError from "aggregate-error";
import { file } from "tempy";
import setLegacyToken from "@semantic-release/npm/lib/set-legacy-token";
import getPkg from "@semantic-release/npm/lib/get-pkg";
import verifyNpmConfig from "@semantic-release/npm/lib/verify-config";
import verifyNpmAuth from "./lib/verify-auth";
import verifyGit from "./lib/verify-git.cjs";
import prepareNpm from "./lib/prepare.cjs";
import publishNpm from "./lib/publish.cjs";
// import generateNotes from "./lib/generate-notes";

export { default as generateNotes } from "./lib/generate-notes";

let verified;
const npmrc = file({ name: ".npmrc" });

const defaultConfig = {
	npmVerifyAuth: true,
	npmPublish: undefined,
	tarballDir: undefined,
	pkgRoot: undefined,
	latch: "minor",
};

/**
 * @template T
 * @param {T} value
 * @param {T} defaultValue
 * @returns {T}
 */
function defaultTo(value, defaultValue) {
	return value === null || value === undefined ? defaultValue : value;
}

export async function verifyConditions(pluginConfig, context) {
	pluginConfig.npmVerifyAuth = defaultTo(pluginConfig.npmVerifyAuth, defaultConfig.npmVerifyAuth);
	pluginConfig.npmPublish = defaultTo(pluginConfig.npmPublish, defaultConfig.npmPublish);
	pluginConfig.tarballDir = defaultTo(pluginConfig.tarballDir, defaultConfig.tarballDir);
	pluginConfig.pkgRoot = defaultTo(pluginConfig.pkgRoot, defaultConfig.pkgRoot);

	const errors = [...verifyNpmConfig(pluginConfig), ...(await verifyGit(context))];

	setLegacyToken(context);

	try {
		if (pluginConfig.npmVerifyAuth) {
			const pkg = await getPkg(pluginConfig, context);
			await verifyNpmAuth(npmrc, pkg, context);
		}
	} catch (error) {
		errors.push(...error);
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}

	verified = true;
}

export async function prepare(pluginConfig, context) {
	pluginConfig.latch = defaultTo(pluginConfig.latch, defaultConfig.latch);

	const errors = verified ? [] : verifyNpmConfig(pluginConfig);

	setLegacyToken(context);

	try {
		if (pluginConfig.npmVerifyAuth) {
			const pkg = await getPkg(pluginConfig, context);
			await verifyNpmAuth(npmrc, pkg, context);
		}
	} catch (error) {
		errors.push(...error);
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}

	await prepareNpm(npmrc, pluginConfig, context);
}

export async function publish(pluginConfig, context) {
	let pkg;
	const errors = verified ? [] : verifyNpmConfig(pluginConfig);

	setLegacyToken(context);

	try {
		// Reload package.json in case a previous external step updated it
		pkg = await getPkg(pluginConfig, context);
		if (!verified && pluginConfig.npmPublish !== false && pkg.private !== true) {
			await verifyNpmAuth(npmrc, pkg, context);
		}
	} catch (error) {
		errors.push(...error);
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}

	return publishNpm(npmrc, pluginConfig, pkg, context);
}

// export default {
// 	verifyConditions,
// 	prepare,
// 	publish,
// 	generateNotes,
// };
