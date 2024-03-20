/* eslint-disable sonarjs/no-duplicate-string -- inherited */

import fs from "node:fs";
import path from "node:path";
import { ValidationError } from "@lerna/validation-error";
import { cosmiconfigSync } from "cosmiconfig";
import globby from "globby";
import { load } from "js-yaml";
import loadJsonFile from "load-json-file";
import log from "npmlog";
import pMap from "p-map";
import { writeJsonFile } from "write-json-file";
import { Package } from "./package";

/**
 * @typedef {object} ProjectConfig
 * @property {string[]} packages
 * @property {boolean} useNx
 * @property {boolean} useWorkspaces
 * @property {string} version
 * @property {string} npmClient
 */

const PACKAGE_GLOB = "packages/*";

/**
 * @param {string[]} results
 */
function normalize(results) {
	return results.map((fp) => path.normalize(fp));
}

function getGlobOpts(rootPath, packageConfigs) {
	const globOpts = {
		cwd: rootPath,
		absolute: true,
		expandDirectories: false,
		followSymbolicLinks: false,
	};

	if (packageConfigs.some((cfg) => cfg.indexOf("**") > -1)) {
		if (packageConfigs.some((cfg) => cfg.indexOf("node_modules") > -1)) {
			throw new ValidationError(
				"EPKGCONFIG",
				"An explicit node_modules package path does not allow globstars (**)",
			);
		}

		globOpts.ignore = [
			// allow globs like "packages/**",
			// but avoid picking up node_modules/**/package.json
			"**/node_modules/**",
		];
	}

	return globOpts;
}

function makeFileFinder(rootPath, packageConfigs) {
	const globOpts = getGlobOpts(rootPath, packageConfigs);

	return (fileName, fileMapper, customGlobOpts) => {
		const options = Object.assign({}, customGlobOpts, globOpts);
		const promise = pMap(
			Array.from(packageConfigs).sort(),
			(globPath) => {
				let chain = globby(path.posix.join(globPath, fileName), options);

				// fast-glob does not respect pattern order, so we re-sort by absolute path
				chain = chain.then((results) => results.sort());

				// POSIX results always need to be normalized
				chain = chain.then(normalize);

				if (fileMapper) {
					chain = chain.then(fileMapper);
				}

				return chain;
			},
			{ concurrency: 4 },
		);

		// always flatten the results
		return promise.then((results) => results.reduce((acc, result) => acc.concat(result), []));
	};
}

/**
 * A representation of the entire project managed by Lerna.
 *
 * Wherever the lerna.json file is located, that is the project root.
 * All package globs are rooted from this location.
 */
export class Project {
	/**
	 * @param {string} [cwd] Defaults to process.cwd()
	 */
	constructor(cwd) {
		const explorer = cosmiconfigSync("lerna", {
			searchPlaces: ["lerna.json", "package.json"],
			transform(obj) {
				// cosmiconfig returns null when nothing is found
				if (!obj) {
					return {
						// No need to distinguish between missing and empty,
						// saves a lot of noisy guards elsewhere
						config: {},
						configNotFound: true,
						// path.resolve(".", ...) starts from process.cwd()
						filepath: path.resolve(cwd || ".", "lerna.json"),
					};
				}

				return obj;
			},
		});

		let loaded;

		try {
			loaded = explorer.search(cwd);
		} catch (err) {
			// redecorate JSON syntax errors, avoid debug dump
			if (err.name === "JSONError") {
				throw new ValidationError(err.name, err.message);
			}

			// re-throw other errors, could be ours or third-party
			throw err;
		}

		/** @type {ProjectConfig} */
		this.config = loaded.config;
		this.configNotFound = loaded.configNotFound;
		this.rootConfigLocation = loaded.filepath;
		this.rootPath = path.dirname(loaded.filepath);

		log.verbose("rootPath", this.rootPath);
	}

	get version() {
		return this.config.version;
	}

	set version(val) {
		this.config.version = val;
	}

	get packageConfigs() {
		const pnpmConfigLocation = path.join(this.rootPath, "pnpm-workspace.yaml");
		if (fs.existsSync(pnpmConfigLocation)) {
			log.verbose(
				"packageConfigs",
				"Package manager 'pnpm' detected. Resolving packages using 'pnpm-workspace.yaml'.",
			);
			const configContent = fs.readFileSync(pnpmConfigLocation);
			const { packages } = load(configContent);

			if (!packages) {
				throw new ValidationError(
					"EWORKSPACES",
					"No 'packages' property found in pnpm-workspace.yaml. See https://pnpm.io/workspaces for help configuring workspaces in pnpm.",
				);
			}

			return packages;
		}

		const npmConfigLocation = path.join(this.rootPath, "package.json");
		if (fs.existsSync(npmConfigLocation)) {
			const { workspaces } = loadJsonFile.sync(npmConfigLocation);
			if (workspaces) {
				return workspaces;
			}
		}

		const lernaConfigLocation = path.join(this.rootPath, "lerna.json");
		if (fs.existsSync(lernaConfigLocation)) {
			const { packages } = loadJsonFile.sync(lernaConfigLocation);
			if (packages) {
				return packages;
			}
		}

		log.warn(
			"EPACKAGES",
			`No packages defined in lerna.json. Defaulting to packages in ${PACKAGE_GLOB}`,
		);
		return [PACKAGE_GLOB];
	}

	/**
	 * @returns {Promise<Package[]>} A promise resolving to a list of Package instances
	 */
	getPackages() {
		const fileFinder = makeFileFinder(this.rootPath, this.packageConfigs);
		const mapper = (packageConfigPath) =>
			loadJsonFile(packageConfigPath).then(
				(packageJson) => new Package(packageJson, path.dirname(packageConfigPath), this.rootPath),
			);

		return fileFinder("package.json", (filePaths) => pMap(filePaths, mapper, { concurrency: 50 }));
	}

	serializeConfig() {
		return writeJsonFile(this.rootConfigLocation, this.config, {
			indent: 2,
			detectIndent: true,
		});
	}
}
