const fs = require("fs");
const path = require("path");
const startServer = require("verdaccio").default;
const tempy = require("tempy");

const NPM_USERNAME = "integration";
const NPM_PASSWORD = "suchsecure";
const NPM_EMAIL = "integration@example.net";

const config = {
	storage: tempy.directory(),
	self_path: __dirname, // eslint-disable-line camelcase
	auth: {
		htpasswd: {
			file: path.join(__dirname, "htpasswd"),
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
	logs: [{ type: "stdout", format: "pretty", level: "error" }],
};

const authEnv = {
	/* eslint-disable-next-line camelcase */
	npm_config_registry: null /* set via start verdaccio */,
	NPM_USERNAME,
	NPM_PASSWORD,
	NPM_EMAIL,
	NPM_TOKEN: Buffer.from(`${NPM_USERNAME}:${NPM_PASSWORD}`).toString("base64"),
};

/** @type {import("http").Server} */
let server;

/** @type {string} */
let registryUrl;

function startVerdaccio() {
	return new Promise((resolve, reject) => {
		try {
			startServer(config, 0, {}, "1.0.0", "verdaccio", (webServer, addr) => {
				webServer.listen(addr.port || addr.path, addr.host, () => {
					registryUrl = `${addr.proto}://${addr.host}:${addr.port}`;
					authEnv.npm_config_registry = registryUrl; /* eslint-disable-line camelcase */
					resolve(webServer);
				});
			});
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * Start local NPM registry
 */
async function start() {
	if (server) {
		throw new Error("server already started");
	}

	server = await startVerdaccio();
}

/**
 * Stop local NPM registry
 */
async function stop() {
	return new Promise((resolve, reject) => {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename */
		fs.rmdirSync(config.storage, { recursive: true });
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
 * Get registry url
 *
 * @returns {string}
 */
function url() {
	return registryUrl;
}

module.exports = { start, stop, authEnv, url };
