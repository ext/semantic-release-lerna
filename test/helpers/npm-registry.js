/* eslint-disable camelcase -- environmental variables use snakecase */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdirSync, realpathSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { startVerdaccio as startServer } from "verdaccio";

const tempdir = realpathSync(os.tmpdir());

const NPM_USERNAME = "integration";
const NPM_PASSWORD = "suchsecure";
const NPM_EMAIL = "integration@example.net";

/**
 * @returns {string}
 */
function temporaryDirectory() {
	const testPath = path.join(tempdir, randomBytes(16).toString("hex"));
	mkdirSync(testPath);
	return testPath;
}

const storage = temporaryDirectory();
const config = {
	storage,
	self_path: path.dirname(fileURLToPath(import.meta.url)),
	auth: {
		htpasswd: {
			file: path.join(storage, "htpasswd"),
			algorithm: "bcrypt",
		},
	},
	uplinks: {},
	packages: {
		"@*/*": {
			access: "$all",
			publish: "$all",
		},
		"**": {
			access: "$all",
			publish: "$all",
		},
	},
	logs: { type: "stdout", format: "pretty", level: "error" },
};

export const authEnv = {
	/** @type {string} */
	npm_config_registry: null /* set via start verdaccio */,

	/** @type {string} */
	NPM_USERNAME,

	/** @type {string} */
	NPM_PASSWORD,

	/** @type {string} */
	NPM_EMAIL,

	/** @type {string} */
	NPM_TOKEN: null /* set via start verdaccio */,
};

/** @type {import("http").Server} */
let server;

/** @type {string} */
let registryHost;

/** @type {string} */
let registryUrl;

function startVerdaccio() {
	return new Promise((resolve, reject) => {
		try {
			startServer(config, 0, {}, "1.0.0", "verdaccio", (webServer, addr) => {
				webServer.listen(addr.port || addr.path, addr.host, () => {
					registryHost = `${addr.host}:${addr.port}`;
					registryUrl = `${addr.proto}://${registryHost}`;
					authEnv.npm_config_registry = registryUrl;
					resolve(webServer);
				});
			});
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * Register a new user in the NPM registry.
 *
 * @param {string} username
 * @param {string} password
 * @param {string} email
 * @returns {void}
 */
async function registerUser(username, password, email) {
	/* eslint-disable-next-line n/no-unsupported-features/node-builtins -- testcases only and appears to work fine under earlier node versions */
	const response = await fetch(`${registryUrl}/-/user/org.couchdb.user:${username}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			_id: `org.couchdb.user:${username}`,
			name: username,
			roles: [],
			type: "user",
			password,
			email,
		}),
	});
	if (!response.ok) {
		throw new Error(`Failed to register user "${username}"`);
	}
}

/**
 * Register a new user in the NPM registry.
 *
 * @param {string} username
 * @param {string} password
 * @returns {{ token: string, user: string, key: string, cidr: string[], readonly: boolean, created: string}}
 */
async function getUserToken(username, password) {
	const authToken = Buffer.from(`${username}:${password}`).toString("base64");
	/* eslint-disable-next-line n/no-unsupported-features/node-builtins -- testcases only and appears to work fine under earlier node versions */
	const response = await fetch(`${registryUrl}/-/npm/v1/tokens`, {
		method: "POST",
		headers: { Authorization: `Basic ${authToken}`, "Content-Type": "application/json" },
		body: JSON.stringify({ password, readonly: false, cidr_whitelist: [] }),
	});
	if (!response.ok) {
		throw new Error(`Failed to get NPM token for user "${username}"`);
	}
	return await response.json();
}

/**
 * Start local NPM registry
 */
export async function start() {
	if (server) {
		throw new Error("server already started");
	}

	server = await startVerdaccio();

	await registerUser(NPM_USERNAME, NPM_PASSWORD, NPM_EMAIL);
	const { token } = await getUserToken(NPM_USERNAME, NPM_PASSWORD);
	authEnv.NPM_TOKEN = token;
}

/**
 * Stop local NPM registry
 */
export async function stop() {
	await fs.rm(config.storage, { recursive: true });
	return new Promise((resolve, reject) => {
		if (server) {
			server.close((error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
			server = null;
		}
	});
}

/**
 * Get auth token for user.
 *
 * @returns {string}
 */
export function getAuthToken() {
	return authEnv.NPM_TOKEN;
}

/**
 * Get registry host (hostname + port)
 *
 * @returns {string}
 */
export function getRegistryHost() {
	return registryHost;
}

/**
 * Get registry url
 *
 * @returns {string}
 */
export function getRegistryUrl() {
	return registryUrl;
}
