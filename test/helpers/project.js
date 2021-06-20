const path = require("path");
const execa = require("execa");
const { outputJson, outputFile } = require("fs-extra");
const npmRegistry = require("./npm-registry");

const MOCK_NAME = "Mock user";
const MOCK_EMAIL = "mock-user@example.net";

/**
 * @typedef {Object} Project
 * @property {string} name - Package name
 * @property {string} manifestLocation - Path to package.json
 * @property {string|null} lockfileLocation - Path to package-lock.json if present
 * @property {string} lernaPath - Path to lerna.json
 * @property {(message: string) => Promise<void>} commit - Create a new git commit
 * @property {(version: string) => Promise<void>} tag - Create a new git tag
 */

/**
 * @returns {string}
 */
function generateAuthToken() {
	const content = `${npmRegistry.authEnv.NPM_USERNAME}:${npmRegistry.authEnv.NPM_PASSWORD}`;
	return Buffer.from(content, "utf8").toString("base64");
}

/**
 * @param {string} cwd - Project directory
 * @param {string} version - Root project initial version
 * @param {{lockfile: boolean, workspaces: boolean}} [options] - Package options
 * @returns {Promise<Project>}
 */
async function createProject(cwd, version, options = {}) {
	const name = "root-pkg";
	const manifestLocation = path.resolve(cwd, "package.json");
	const lockfileLocation = path.resolve(cwd, "package-lock.json");
	const lernaPath = path.resolve(cwd, "lerna.json");
	const authToken = generateAuthToken();
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

	await outputJson(
		manifestLocation,
		{
			name,
			version: "0.0.0",
			publishConfig: {},
			workspaces: options.workspaces ? ["packages/*"] : undefined,
		},
		{ spaces: 2 }
	);
	await outputJson(lernaPath, { version, packages: ["packages/*"] });
	await outputFile(
		path.resolve(cwd, ".npmrc"),
		[
			`registry=${npmRegistry.url()}`,
			`//${npmRegistry.url()}:_authToken=${authToken}`,
			`_auth=${authToken}`,
			"email=${NPM_EMAIL}", // eslint-disable-line no-template-curly-in-string
		].join("\n"),
		"utf-8"
	);
	await outputFile(path.resolve(cwd, ".gitignore"), ["node_modules"].join("\n"), "utf-8");

	await execa("git", ["init"], { cwd, env: gitEnv });
	await execa("git", ["add", ".npmrc", ".gitignore", "lerna.json", "package.json"], {
		cwd,
		env: gitEnv,
	});

	if (options.lockfile) {
		await execa("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit"], {
			cwd,
			env: npmEnv,
		});
		await execa("git", ["add", "package-lock.json"], {
			cwd,
			env: gitEnv,
		});
	}

	await execa("git", ["commit", "-m", "initial commit"], { cwd, env: gitEnv });

	return {
		name,
		manifestLocation,
		lockfileLocation: options.lockfile ? lockfileLocation : null,
		lernaPath,
		async commit(message) {
			await execa("git", ["add", "."], { cwd, env: gitEnv });
			await execa("git", ["commit", "-m", message], { cwd, env: gitEnv });
			const ref = await execa("git", ["rev-parse", "--short", "HEAD"], { cwd, env: gitEnv });
			return {
				message,
				hash: ref.stdout,
			};
		},
		resolve(...parts) {
			return path.resolve(cwd, ...parts);
		},
		async tag(version) {
			await execa("git", ["tag", version], { cwd, env: gitEnv });
		},
	};
}

module.exports = { createProject };
