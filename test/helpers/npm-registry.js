/* eslint-disable camelcase -- environmental variables use snakecase */

const fs = require("node:fs/promises");
const path = require("node:path");
const startServer = require("verdaccio").default;
const tempy = require("tempy");
const got = require("got");

const NPM_USERNAME = "integration";
const NPM_PASSWORD = "suchsecure";
const NPM_EMAIL = "integration@example.net";

const storage = tempy.directory();
const config = {
	storage,
	self_path: __dirname,
	auth: {
		htpasswd: {
			file: path.join(storage, "htpasswd"),
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

const authEnv = {
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
 * @returns {{ token: string, user: string, key: string, cidr: string[], readonly: boolean, created: string}}
 */
async function registerUser(username, password, email) {
	await got(`${registryUrl}/-/user/org.couchdb.user:${username}`, {
		method: "PUT",
		json: {
			_id: `org.couchdb.user:${username}`,
			name: username,
			roles: [],
			type: "user",
			password,
			email,
		},
	});
	return await got(`${registryUrl}/-/npm/v1/tokens`, {
		username,
		password,
		method: "POST",
		headers: { "content-type": "application/json" },
		json: { password, readonly: false, cidr_whitelist: [] },
	}).json();
}

/**
 * Start local NPM registry
 */
async function start() {
	if (server) {
		throw new Error("server already started");
	}

	server = await startVerdaccio();

	const { token } = await registerUser(NPM_USERNAME, NPM_PASSWORD, NPM_EMAIL);
	authEnv.NPM_TOKEN = token;
}

/**
 * Stop local NPM registry
 */
async function stop() {
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
function getAuthToken() {
	return authEnv.NPM_TOKEN;
}

/**
 * Get registry host (hostname + port)
 *
 * @returns {string}
 */
function getRegistryHost() {
	return registryHost;
}

/**
 * Get registry url
 *
 * @returns {string}
 */
function url() {
	return registryUrl;
}

module.exports = { start, stop, authEnv, getAuthToken, getRegistryHost, url };
