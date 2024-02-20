import path from "node:path";
import { existsSync } from "node:fs";

/**
 * @typedef {'npm'|'pnpm'|'yarn'} PackageManager
 */

/**
 * The list of configuration for package managers
 * @type {[{lockFile: string, packageManager: PackageManager, updateLockFileCommand: string[]}]}
 */
const packageManagerConfigurations = [
	{
		packageManager: "npm",
		lockFile: "package-lock.json",
		updateLockFileCommand: [
			"npm",
			"install",
			"--package-lock-only",
			"--ignore-scripts",
			"--no-audit",
		],
	},
	{
		packageManager: "pnpm",
		lockFile: "pnpm-lock.yaml",
		updateLockFileCommand: ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],
	},
	{
		packageManager: "yarn",
		lockFile: "yarn.lock",
		updateLockFileCommand: ["yarn", "install"],
	},
];

/**
 * Detect package manager from lockFile
 * @param {string} location root of the project used to search for lockfile
 * @returns {PackageManager}
 */
export function getPackageManagerFromLockFile(location) {
	return (
		packageManagerConfigurations.find(({ lockFile }) => existsSync(path.join(location, lockFile)))
			?.packageManager ?? "npm"
	);
}

/**
 * define lockfile from package manager
 * @param {PackageManager} packageManager
 * @returns {string}
 */
export function getLockFileFromPackageManager(packageManager) {
	return packageManagerConfiguration(packageManager).lockFile;
}

/**
 * @param {PackageManager} pm the package manager
 * @returns {{lockFile: string, packageManager: ("npm"|"pnpm"|"yarn"), updateLockFileCommand: string[]}} the associated configuration
 */
function packageManagerConfiguration(pm) {
	return packageManagerConfigurations.find(({ packageManager }) => packageManager === pm);
}

/**
 * Add dynamic configuration to a command
 * @param {(any) => string[]} commandSelector
 * @param {PackageManager} packageManager
 * @param {string} npmrc
 * @returns {string[]}
 */
function findAndPrepareCommand(commandSelector, packageManager, npmrc) {
	const command = commandSelector(packageManagerConfiguration(packageManager));
	const extension = packageManager === "npm" ? ["--userconfig", npmrc] : [];
	return [...command, ...extension];
}

/**
 * Get the update lockFile command
 * @param {PackageManager} packageManager
 * @param {string} npmrc
 * @returns {string[]}
 */
export function getUpdateLockFileCommand(packageManager, npmrc) {
	return findAndPrepareCommand(
		(configuration) => configuration.updateLockFileCommand,
		packageManager,
		npmrc,
	);
}
