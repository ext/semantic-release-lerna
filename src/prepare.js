import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { format } from "node:util";
import { execa } from "execa";
import npmVersion from "libnpmversion";
import { parse as semverParse, satisfies as semverSatisfies, validRange } from "semver";
import { Package } from "./lerna/package";
import { Project } from "./lerna/project";
import getChangedPackages from "./get-changed-packages.js";
import { writeJsonFile } from "./utils";
import {
	getLockFileFromPackageManager,
	getPackageManagerFromLockFile,
	getUpdateLockFileCommand,
} from "./utils/package-manager-commands.js";

/**
 * @param {string} path
 * @returns {any}
 **/
async function readJson(path) {
	return JSON.parse(await fs.readFile(path));
}

/**
 * Bump version in "lerna.json".
 *
 * @param {string} basePath
 * @param {any} context
 * @returns {Promise<void>}
 */
async function updateLernaJson(basePath, context) {
	const {
		logger,
		nextRelease: { version },
	} = context;
	logger.log("Write version %s to lerna.json in %s", version, basePath);
	const project = new Project(basePath, logger);
	project.version = version;
	await project.serializeConfig();
}

/**
 * Bump version in a single package "package.json".
 *
 * @param {string} npmrc
 * @param {Package} pkg
 * @param {any} context
 * @param {Record<string, string>} currentVersions
 * @returns {Promise<void>}
 */
async function updatePackage(npmrc, pkg, context, currentVersions) {
	const {
		nextRelease: { version },
		logger,
	} = context;
	logger.log("Write version %s to package.json in %s", version, pkg.location);

	await npmVersion(version, {
		path: pkg.location,
		allowSameVersion: true,
		commitHooks: false,
		gitTagVersion: false,
		signGitCommit: false,
		signGitTag: false,
		force: false,
		ignoreScripts: false,
	});

	/* Bump dependencies */
	if (currentVersions) {
		await updatePackageDependencies(pkg, version, currentVersions);
	}
}

/**
 * Bump version in a single package "package-lock.json".
 *
 * Noop if "package-lock.json" does not exist.
 *
 * @param {string} npmrc
 * @param {Package} pkg
 * @param {any} context
 * @returns {Promise<void>}
 */
async function updateLockfile(npmrc, pkg, context) {
	const { env, stdout, stderr, logger } = context;

	const packageManager = getPackageManagerFromLockFile(pkg.location);
	const packageFile = getLockFileFromPackageManager(packageManager);

	if (!existsSync(path.join(pkg.location, packageFile))) {
		return;
	}

	const [command, ...options] = getUpdateLockFileCommand(packageManager, npmrc);

	logger.log("Update %s file in %s", packageFile, pkg.location);

	const versionResult = execa(command, options, {
		cwd: pkg.location,
		env,
	});
	versionResult.stdout.pipe(stdout, { end: false });
	versionResult.stderr.pipe(stderr, { end: false });
	await versionResult;
}

/**
 * @param {Record<string, string>} dependencies
 * @param {string} newVersion
 * @param {Record<string, string>} currentVersions
 * @returns {void}
 */
/* eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- hard to refactor into something much more readable */
function bumpDependency(dependencies, newVersion, currentVersions) {
	const newParsed = semverParse(newVersion);
	if (!newParsed) {
		return;
	}
	for (const [dep, range] of Object.entries(dependencies)) {
		if (!currentVersions[dep]) {
			continue;
		}

		const version = currentVersions[dep];
		const parsed = semverParse(version);
		if (!parsed) {
			continue;
		}

		/* Exact versions */
		if (range === version) {
			dependencies[dep] = newVersion;
			continue;
		}

		/* Hat ^x.y.z */
		if (range === `^${version}`) {
			dependencies[dep] = `^${newVersion}`;
			continue;
		}

		/* Hat ^x.y */
		if (range === `^${parsed.major}.${parsed.minor}`) {
			dependencies[dep] = `^${newParsed.major}.${newParsed.minor}`;
			continue;
		}

		/* Hat ^x */
		if (range === `^${parsed.major}`) {
			dependencies[dep] = `^${newParsed.major}`;
			continue;
		}

		/* If the range is a a valid semver range but is no longer satisfied by the
		 * new version forcibly update the range */
		if (validRange(range)) {
			const isSatisfied = semverSatisfies(newVersion, range);
			if (!isSatisfied) {
				const hat = range.startsWith("^") ? "^" : "";
				const numComponents = Array.from(range).filter((it) => it === ".").length + 1;
				const components = [newParsed.major, newParsed.minor, newParsed.patch];
				dependencies[dep] = `${hat}${components.slice(0, numComponents).join(".")}`;
			}
		}
	}
}

/**
 * @param {Package} pkg
 * @param {string} newVersion
 * @param {Record<string, string>} currentVersions
 * @returns {Promise<void>}
 */
async function updatePackageDependencies(pkg, newVersion, currentVersions) {
	const pkgData = await readJson(pkg.manifestLocation);

	bumpDependency(pkgData.dependencies || {}, newVersion, currentVersions);
	bumpDependency(pkgData.devDependencies || {}, newVersion, currentVersions);
	bumpDependency(pkgData.peerDependencies || {}, newVersion, currentVersions);

	await writeJsonFile(pkg.manifestLocation, pkgData);
}

/**
 * Get current version from `package.json`.
 *
 * @param {Package} pkg
 * @returns {Promise<[string, string]>}
 */
async function getCurrentVersion(pkg) {
	const pkgData = await readJson(pkg.manifestLocation);
	return [pkgData.name, pkgData.version];
}

/**
 * @param {string} npmrc
 * @param {any} context
 * @returns {Promise<void>}
 */
export default async function (npmrc, pluginConfig, context) {
	const {
		cwd,
		nextRelease: { version },
		logger,
	} = context;
	const basePath = pluginConfig.pkgRoot ? path.resolve(cwd, pluginConfig.pkgRoot) : cwd;
	const rootPkg = new Package(readJson(path.join(basePath, "package.json")), basePath);
	const { rootVersion = true } = pluginConfig;

	const changed = await getChangedPackages(pluginConfig.latch, { cwd, logger, version });
	if (changed.length === 0) {
		logger.log("No packages changed, applying version bump on root package only");
		await updateLernaJson(basePath, context);
		await updatePackage(npmrc, rootPkg, context);
		return;
	}

	const s = changed.length > 1 ? "s" : "";
	logger.log(
		`${changed.length} package${s} need version bump: ${format(changed.map((pkg) => pkg.name))}`,
	);

	const currentVersions = Object.fromEntries(
		await Promise.all(changed.map((pkg) => getCurrentVersion(pkg))),
	);

	/* Bump version in all changed packages */
	for (const pkg of changed) {
		await updatePackage(npmrc, pkg, context, currentVersions);
	}

	/* Bump version in "lerna.json" */
	await updateLernaJson(basePath, context);

	if (rootVersion) {
		await updatePackage(npmrc, rootPkg, context);
		await updateLockfile(npmrc, rootPkg, context);
	} else {
		logger.log("Don't write version to root package.json");
	}
}
