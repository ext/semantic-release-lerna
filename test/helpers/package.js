import path from "node:path";
import { execa } from "execa";
import {
	getLockFileFromPackageManager,
	getUpdateLockFileCommand,
} from "../../src/utils/package-manager-commands.js";
import { outputJson } from "./output-json";

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
 * @param {{private?: boolean, lockfile?: boolean, packageManager?: 'npm' | 'pnpm' | 'yarn', workspaces?: boolean}} [options] - Package options
 * @returns {Promise<Package>}
 */
export async function createPackage(cwd, name, version, options = {}) {
	const pkgRoot = `packages/${name}`;
	const manifestLocation = path.resolve(cwd, pkgRoot, "package.json");
	const { lockfile, packageManager = "npm" } = options;
	const lockFileName = getLockFileFromPackageManager(packageManager);
	const lockfileLocation = lockfile ? path.resolve(cwd, pkgRoot, lockFileName) : null;
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
		const [command, ...args] = getUpdateLockFileCommand(
			packageManager,
			path.resolve(cwd, ".npmrc"),
		);

		if (packageManager === "pnpm" && options.workspaces) {
			args.push("-w");
		}

		await execa(command, args, {
			cwd: path.resolve(cwd, pkgRoot),
			env: npmEnv,
		});
	}

	await execa("git", ["add", pkgRoot], { cwd, env: gitEnv });
	await execa("git", ["commit", "-m", `add ${name} package`], { cwd, env: gitEnv });

	return {
		name,
		manifestLocation,
		lockfileLocation,
		async require(dep) {
			let args;
			switch (packageManager) {
				case "npm":
					args = ["install", "--workspace", this.name, dep.name];
					break;
				case "pnpm":
					args = ["add", "--workspace", "--filter", this.name, dep.name];
					break;
				case "yarn":
					args = ["add", this.name, dep.name];
					break;
			}
			await execa(packageManager, args, { cwd });
		},
		resolve(...parts) {
			return path.resolve(cwd, pkgRoot, ...parts);
		},
	};
}
