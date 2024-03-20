import path from "node:path";
import npa from "npm-package-arg";

// symbol used to "hide" internal state
const PKG = Symbol("pkg");

// private fields
const _location = Symbol("location");
const _resolved = Symbol("resolved");
const _rootPath = Symbol("rootPath");
const _scripts = Symbol("scripts");

/**
 * @typedef {object} RawManifest The subset of package.json properties that Lerna uses
 * @property {string} name
 * @property {string} version
 * @property {boolean} [private]
 * @property {Record<string, string>|string} [bin]
 * @property {Record<string, string>} [scripts]
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 * @property {Record<string, string>} [optionalDependencies]
 * @property {Record<string, string>} [peerDependencies]
 * @property {Record<'directory' | 'registry' | 'tag', string>} [publishConfig]
 */

/**
 * Lerna's internal representation of a local package, with
 * many values resolved directly from the original JSON.
 */
export class Package {
	/**
	 * @param {RawManifest} pkg
	 * @param {string} location
	 * @param {string} [rootPath]
	 */
	constructor(pkg, location, rootPath = location) {
		// npa will throw an error if the name is invalid
		const resolved = npa.resolve(pkg.name, `file:${path.relative(rootPath, location)}`, rootPath);

		this.name = pkg.name;
		this[PKG] = pkg;

		// omit raw pkg from default util.inspect() output, but preserve internal mutability
		Object.defineProperty(this, PKG, { enumerable: false, writable: true });

		this[_location] = location;
		this[_resolved] = resolved;
		this[_rootPath] = rootPath;
		this[_scripts] = { ...pkg.scripts };
	}

	// readonly getters
	get location() {
		return this[_location];
	}

	get private() {
		return Boolean(this[PKG].private);
	}

	get resolved() {
		return this[_resolved];
	}

	get rootPath() {
		return this[_rootPath];
	}

	get scripts() {
		return this[_scripts];
	}

	get manifestLocation() {
		return path.join(this.location, "package.json");
	}

	get nodeModulesLocation() {
		return path.join(this.location, "node_modules");
	}

	// accessors
	get version() {
		return this[PKG].version;
	}

	set version(version) {
		this[PKG].version = version;
	}

	// "live" collections
	get dependencies() {
		return this[PKG].dependencies;
	}

	get devDependencies() {
		return this[PKG].devDependencies;
	}

	get optionalDependencies() {
		return this[PKG].optionalDependencies;
	}

	get peerDependencies() {
		return this[PKG].peerDependencies;
	}

	/**
	 * Map-like retrieval of arbitrary values
	 * @template {keyof RawManifest} K
	 * @param {K} key field name to retrieve value
	 * @returns {RawManifest[K]} value stored under key, if present
	 */
	get(key) {
		return this[PKG][key];
	}

	/**
	 * Map-like storage of arbitrary values
	 * @template {keyof RawManifest} K
	 * @param {T} key field name to store value
	 * @param {RawManifest[K]} val value to store
	 * @returns {Package} instance for chaining
	 */
	set(key, val) {
		this[PKG][key] = val;

		return this;
	}
}
