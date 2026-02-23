import { collectDependents } from "./collect-dependents.js";

/**
 * Build a list of graph nodes, possibly including dependents, using predicate if available.
 */
export function collectPackages(
	packages,
	{ isCandidate = () => true, onInclude, excludeDependents } = {},
) {
	const candidates = new Set();

	for (const [name, node] of packages.entries()) {
		if (isCandidate(node, name)) {
			candidates.add(node);
		}
	}

	if (!excludeDependents) {
		for (const node of collectDependents(candidates)) {
			candidates.add(node);
		}
	}

	// The result should always be in the same order as the input
	const updates = [];

	for (const [name, node] of packages.entries()) {
		if (candidates.has(node)) {
			if (onInclude) {
				onInclude(name);
			}
			updates.push(node);
		}
	}

	return updates;
}
