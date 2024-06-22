import { outputFile } from "./output-file";

export async function outputJson(file, data) {
	const str = JSON.stringify(data);
	await outputFile(file, `${str}\n`);
}
