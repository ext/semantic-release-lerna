import { randomBytes } from "node:crypto";
import fs, { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import AggregateError from "aggregate-error";
import getPkg from "./get-pkg.js";
import prepareNpm from "./prepare.js";
import publishNpm from "./publish.js";
import verifyNpmAuth from "./verify-auth.js";
import verifyNpmConfig from "./verify-config.js";
import verifyGit from "./verify-git.js";

export { generateNotes } from "./generate-notes.js";

let verified;

const tempdir = realpathSync(os.tmpdir());
const npmrc = temporaryFile({ name: ".npmrc" });

const defaultConfig = {
	npmVerifyAuth: true,
	npmPublish: undefined,
	tarballDir: undefined,
	pkgRoot: undefined,
	latch: "minor",
};

/**
 * @param {{ name: string }}  options
 * @returns {string}
 */
function temporaryFile(options) {
	const { name } = options;
	const directory = path.join(tempdir, randomBytes(16).toString("hex"));
	fs.mkdirSync(directory);
	return path.join(directory, name);
}

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

	try {
		if (pluginConfig.npmVerifyAuth) {
			const pkg = await getPkg(pluginConfig, context);
			await verifyNpmAuth(npmrc, pkg, context);
		}
	} catch (error) {
		if (Array.isArray(error.errors)) {
			errors.push(...error.errors);
		} else {
			errors.push(error);
		}
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}

	verified = true;
}

export async function prepare(pluginConfig, context) {
	pluginConfig.latch = defaultTo(pluginConfig.latch, defaultConfig.latch);

	const errors = verified ? [] : verifyNpmConfig(pluginConfig);

	try {
		if (pluginConfig.npmVerifyAuth) {
			const pkg = await getPkg(pluginConfig, context);
			await verifyNpmAuth(npmrc, pkg, context);
		}
	} catch (error) {
		if (Array.isArray(error.errors)) {
			errors.push(...error.errors);
		} else {
			errors.push(error);
		}
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}

	await prepareNpm(npmrc, pluginConfig, context);
}

export async function publish(pluginConfig, context) {
	let pkg;
	const errors = verified ? [] : verifyNpmConfig(pluginConfig);

	try {
		// Reload package.json in case a previous external step updated it
		pkg = await getPkg(pluginConfig, context);
		if (!verified && pluginConfig.npmPublish !== false && pkg.private !== true) {
			await verifyNpmAuth(npmrc, pkg, context);
		}
	} catch (error) {
		if (Array.isArray(error.errors)) {
			errors.push(...error.errors);
		} else {
			errors.push(error);
		}
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}

	return publishNpm(npmrc, pluginConfig, pkg, context);
}
