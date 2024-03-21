import fs from "node:fs/promises";
import detectIndent from "detect-indent";

/**
 * @param {string} filePath
 * @param {any) data
 * @returns {Promise<void>}
 */
export async function writeJsonFile(filePath, data) {
	let indent = 2;
	let trailingNewline = "\n";
	try {
		const file = await fs.readFile(filePath, "utf8");
		if (!file.endsWith("\n")) {
			trailingNewline = "";
		}

		indent = detectIndent(file).indent;
	} catch (error) {
		if (error.code !== "ENOENT") {
			throw error;
		}
	}

	const json = JSON.stringify(data, null, indent);
	await fs.writeFile(filePath, `${json}${trailingNewline}`, "utf-8");
}
