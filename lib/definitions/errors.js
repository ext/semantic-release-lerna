export function EDIRTYWC({ files }) {
	return {
		message: "Dirty working copy.",
		details: `The git working copy must be clean before releasing:\n\n${files.join("\n")}\n`,
	};
}
