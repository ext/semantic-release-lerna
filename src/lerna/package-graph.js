import { ValidationError } from "@lerna/validation-error";
import npa from "npm-package-arg";
import semver from "semver";

const PKG = Symbol("pkg");

/**
 * A node in a PackageGraph.
 */
class PackageGraphNode {
	/**
	 * @param {import("./package").Package} pkg
	 */
	constructor(pkg) {
		this.name = pkg.name;
		this[PKG] = pkg;

		// omit raw pkg from default util.inspect() output
		Object.defineProperty(this, PKG, { enumerable: false });

		/** @type {Map<string, PackageGraphNode>} */
		this.localDependents = new Map();
	}

	get location() {
		return this[PKG].location;
	}

	get pkg() {
		return this[PKG];
	}

	get version() {
		return this[PKG].version;
	}

	/**
	 * Determine if the Node satisfies a resolved semver range.
	 * @see https://github.com/npm/npm-package-arg#result-object
	 *
	 * @param {!Result} resolved npm-package-arg Result object
	 * @returns {Boolean}
	 */
	satisfies({ gitCommittish, gitRange, fetchSpec }) {
		return semver.satisfies(this.version, gitCommittish || gitRange || fetchSpec);
	}

	/**
	 * Returns a string representation of this node (its name)
	 *
	 * @returns {String}
	 */
	toString() {
		return this.name;
	}
}

/**
 * A graph of packages in the current project.
 *
 * @extends {Map<string, PackageGraphNode>}
 */
export class PackageGraph extends Map {
	/**
	 * @param {import("./package").Package[]} packages An array of Packages to build the graph out of.
	 * @param {'allDependencies'|'dependencies'} [graphType]
	 *    Pass "dependencies" to create a graph of only dependencies,
	 *    excluding the devDependencies that would normally be included.
	 */
	constructor(packages, graphType = "allDependencies") {
		super(packages.map((pkg) => [pkg.name, new PackageGraphNode(pkg)]));

		if (packages.length !== this.size) {
			// weed out the duplicates
			const seen = new Map();

			for (const { name, location } of packages) {
				if (seen.has(name)) {
					seen.get(name).push(location);
				} else {
					seen.set(name, [location]);
				}
			}

			for (const [name, locations] of seen) {
				if (locations.length > 1) {
					throw new ValidationError(
						"ENAME",
						[`Package name "${name}" used in multiple packages:`, ...locations].join("\n\t"),
					);
				}
			}
		}

		this.forEach((currentNode, currentName) => {
			const graphDependencies =
				graphType === "dependencies"
					? Object.assign({}, currentNode.pkg.optionalDependencies, currentNode.pkg.dependencies)
					: Object.assign(
							{},
							currentNode.pkg.devDependencies,
							currentNode.pkg.optionalDependencies,
							currentNode.pkg.dependencies,
					  );

			/* eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- inherited technical debt */
			Object.keys(graphDependencies).forEach((depName) => {
				const depNode = this.get(depName);
				// Yarn decided to ignore https://github.com/npm/npm/pull/15900 and implemented "link:"
				// As they apparently have no intention of being compatible, we have to do it for them.
				// @see https://github.com/yarnpkg/yarn/issues/4212
				let spec = graphDependencies[depName].replace(/^link:/, "file:");

				// Support workspace: protocol for pnpm and yarn 2+ (https://pnpm.io/workspaces#workspace-protocol-workspace)
				const isWorkspaceSpec = /^workspace:/.test(spec);

				let fullWorkspaceSpec;
				let workspaceAlias;
				if (isWorkspaceSpec) {
					fullWorkspaceSpec = spec;
					spec = spec.replace(/^workspace:/, "");

					// replace aliases (https://pnpm.io/workspaces#referencing-workspace-packages-through-aliases)
					if (spec === "*" || spec === "^" || spec === "~") {
						workspaceAlias = spec;
						if (depNode?.version) {
							const prefix = spec === "*" ? "" : spec;
							const version = depNode.version;
							spec = `${prefix}${version}`;
						} else {
							spec = "*";
						}
					}
				}

				const resolved = npa.resolve(depName, spec, currentNode.location);
				resolved.workspaceSpec = fullWorkspaceSpec;
				resolved.workspaceAlias = workspaceAlias;

				if (!depNode) {
					// it's an external dependency, store the resolution and bail
					return;
				}

				if (resolved.fetchSpec === depNode.location || depNode.satisfies(resolved)) {
					// a local file: specifier OR a matching semver
					depNode.localDependents.set(currentName, currentNode);
				} else {
					if (isWorkspaceSpec) {
						// pnpm refuses to resolve remote dependencies when using the workspace: protocol, so lerna does too. See: https://pnpm.io/workspaces#workspace-protocol-workspace.
						throw new ValidationError(
							"EWORKSPACE",
							`Package specification "${depName}@${spec}" could not be resolved within the workspace. To reference a non-matching, remote version of a local dependency, remove the 'workspace:' prefix.`,
						);
					}
				}
			});
		});
	}

	get rawPackageList() {
		return Array.from(this.values(), (node) => node.pkg);
	}
}
