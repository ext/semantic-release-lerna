import { collectDependents } from "./collect-dependents.js";

/**
 * Build a list of graph nodes, possibly including dependents, using predicate if available.
 */
export function collectPackages(
	packages,
	{ isCandidate = () => true, onInclude, excludeDependents } = {},
) {
	const candidates = new Set();

	packages.forEach((node, name) => {
		if (isCandidate(node, name)) {
			candidates.add(node);
		}
	});

	if (!excludeDependents) {
		collectDependents(candidates).forEach((node) => candidates.add(node));
	}

	// The result should always be in the same order as the input
	const updates = [];

	packages.forEach((node, name) => {
		if (candidates.has(node)) {
			if (onInclude) {
				onInclude(name);
			}
			updates.push(node);
		}
	});

	return updates;
}
