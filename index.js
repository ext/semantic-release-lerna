const AggregateError = require("aggregate-error");
const tempy = require("tempy");
const getPkg = require("@semantic-release/npm/lib/get-pkg");
const verifyNpmConfig = require("@semantic-release/npm/lib/verify-config");
const verifyNpmAuth = require("./lib/verify-auth");
const verifyGit = require("./lib/verify-git");
const prepareNpm = require("./lib/prepare");
const publishNpm = require("./lib/publish");
const generateNotes = require("./lib/generate-notes");

let verified;
const npmrc = tempy.file({ name: ".npmrc" });

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

async function verifyConditions(pluginConfig, context) {
	pluginConfig.npmVerifyAuth = defaultTo(pluginConfig.npmVerifyAuth, defaultConfig.npmVerifyAuth);
	pluginConfig.npmPublish = defaultTo(pluginConfig.npmPublish, defaultConfig.npmPublish);
	pluginConfig.tarballDir = defaultTo(pluginConfig.tarballDir, defaultConfig.tarballDir);
	pluginConfig.pkgRoot = defaultTo(pluginConfig.pkgRoot, defaultConfig.pkgRoot);

	const errors = [...verifyNpmConfig(pluginConfig), ...(await verifyGit(context))];

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

async function prepare(pluginConfig, context) {
	pluginConfig.latch = defaultTo(pluginConfig.latch, defaultConfig.latch);

	const errors = verified ? [] : verifyNpmConfig(pluginConfig);

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

async function publish(pluginConfig, context) {
	let pkg;
	const errors = verified ? [] : verifyNpmConfig(pluginConfig);

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

module.exports = {
	verifyConditions,
	prepare,
	publish,
	generateNotes,
};
