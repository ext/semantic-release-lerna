import path from "node:path";
import { execa } from "execa";
import { outputJson, outputFile } from "fs-extra";
import {
	getLockFileFromPackageManager,
	getUpdateLockFileCommand,
} from "../../src/utils/package-manager-commands.js";
import * as npmRegistry from "./npm-registry";

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
function generateNpmrc() {
	return [
		`registry=${npmRegistry.getRegistryUrl()}`,
		`//${npmRegistry.getRegistryHost()}/:_authToken=${npmRegistry.getAuthToken()}`,
		"email=${NPM_EMAIL}",
	].join("\n");
}

const WORKSPACES = ["packages/*"];

/**
 * @param {string} cwd - Project directory
 * @param {string} version - Root project initial version
 * @param {{private?: boolean, lockfile?: boolean, packageManager?: 'npm' | 'pnpm' | 'yarn', workspaces?: boolean}} [options] - Package options
 * @returns {Promise<Project>}
 */
export async function createProject(cwd, version, options = {}) {
	const name = "root-pkg";
	const manifestLocation = path.resolve(cwd, "package.json");
	const { lockfile, packageManager = "npm" } = options;
	const lockFileName = getLockFileFromPackageManager(packageManager);
	const lockfileLocation = lockfile ? path.resolve(cwd, lockFileName) : null;
	const lernaPath = path.resolve(cwd, "lerna.json");
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
			workspaces: options.workspaces ? WORKSPACES : undefined,
		},
		{ spaces: 2 },
	);

	if (packageManager === "pnpm" && options.workspaces) {
		await outputJson(
			path.resolve(cwd, "pnpm-workspace.yaml"),
			{
				packages: WORKSPACES,
			},
			{ spaces: 2 },
		);
	}

	await outputJson(lernaPath, { version, packages: WORKSPACES });
	await outputFile(path.resolve(cwd, ".npmrc"), generateNpmrc(), "utf-8");
	await outputFile(path.resolve(cwd, ".gitignore"), ["node_modules"].join("\n"), "utf-8");

	await execa("git", ["init"], { cwd, env: gitEnv });
	await execa("git", ["add", ".npmrc", ".gitignore", "lerna.json", "package.json"], {
		cwd,
		env: gitEnv,
	});

	if (options.lockfile) {
		const [command, ...args] = getUpdateLockFileCommand(
			packageManager,
			path.resolve(cwd, ".npmrc"),
		);

		if (packageManager === "npm") {
			args.push("--lockfile-version=2");
		} else if (packageManager === "pnpm" && options.workspaces) {
			args.push("-w");
		}

		await execa(command, args, {
			cwd,
			env: npmEnv,
		});
		await execa("git", ["add", lockFileName], {
			cwd,
			env: gitEnv,
		});
	}

	await execa("git", ["commit", "-m", "initial commit"], { cwd, env: gitEnv });

	return {
		name,
		manifestLocation,
		lockfileLocation,
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
