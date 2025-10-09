import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export async function outputFile(file, data) {
	const dir = path.dirname(file);
	if (!existsSync(dir)) {
		await fs.mkdir(dir, { recursive: true });
	}
	await fs.writeFile(file, data, "utf-8");
}
