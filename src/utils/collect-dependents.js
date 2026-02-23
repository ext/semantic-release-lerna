/**
 * Build a set of nodes that are dependents of the input set.
 */
export function collectDependents(nodes) {
	const collected = new Set();

	for (const currentNode of nodes) {
		if (currentNode.localDependents.size === 0) {
			// no point diving into a non-existent tree
			continue;
		}

		// breadth-first search
		const queue = [currentNode];
		const seen = new Set();

		const visit = (dependentNode, dependentName, siblingDependents) => {
			if (seen.has(dependentNode)) {
				return;
			}

			seen.add(dependentNode);

			if (dependentNode === currentNode || siblingDependents.has(currentNode.name)) {
				// a direct or transitive cycle, skip it
				return;
			}

			collected.add(dependentNode);
			queue.push(dependentNode);
		};

		while (queue.length > 0) {
			const node = queue.shift();

			/* eslint-disable-next-line unicorn/no-array-for-each -- technical debt */
			node.localDependents.forEach(visit);
		}
	}

	return collected;
}
