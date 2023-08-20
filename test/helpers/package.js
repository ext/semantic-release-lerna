const path = require("path");
const execa = require("execa");
const { outputJson } = require("fs-extra");

const MOCK_NAME = "Mock user";
const MOCK_EMAIL = "mock-user@example.net";

/**
 * @typedef {Object} Package
 * @property {string} name - Package name
 * @property {string} manifestLocation - Path to package.json
 * @property {string|null} lockfileLocation - Path to package-lock.json if present
 * @property {(dependency: string) => Promise<void>} require - Add a new dependency
 * @property {(...parts: string[]) => string} resolve - Resolve path inside package
 */

/**
 * @param {string} cwd - Project directory
 * @param {string} name - Package name
 * @param {string} version - Package initial version
 * @param {{private: boolean, lockfile: boolean}} [options] - Package options
 * @returns {Promise<Package>}
 */
async function createPackage(cwd, name, version, options = {}) {
	const pkgRoot = `packages/${name}`;
	const manifestLocation = path.resolve(cwd, pkgRoot, "package.json");
	const lockfileLocation = path.resolve(cwd, pkgRoot, "package-lock.json");
	const npmEnv = {
		...process.env,
		NPM_EMAIL: MOCK_EMAIL,
	};
	const gitEnv = {
		...process.env,
		GIT_AUTHOR_NAME: MOCK_NAME,
		GIT_AUTHOR_EMAIL: MOCK_EMAIL,
		GIT_COMMITTER_NAME: MOCK_NAME,
		GIT_COMMITTER_EMAIL: MOCK_EMAIL,
	};

	await outputJson(manifestLocation, { name, version, private: options.private });
	if (options.lockfile) {
		await execa("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit"], {
			cwd: path.resolve(cwd, pkgRoot),
			env: npmEnv,
		});
	}

	await execa("git", ["add", pkgRoot], { cwd, env: gitEnv });
	await execa("git", ["commit", "-m", `add ${name} package`], { cwd, env: gitEnv });

	return {
		name,
		manifestLocation,
		lockfileLocation: options.lockfile ? lockfileLocation : null,
		async require(dep) {
			await execa("npm", ["install", "--workspace", this.name, dep.name], { cwd });
		},
		resolve(...parts) {
			return path.resolve(cwd, pkgRoot, ...parts);
		},
	};
}

module.exports = { createPackage };
