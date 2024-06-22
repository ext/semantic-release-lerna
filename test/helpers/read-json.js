import fs from "node:fs/promises";

export async function readJson(file) {
	const content = await fs.readFile(file, "utf-8");
	return JSON.parse(content);
}
