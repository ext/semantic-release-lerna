import path from "node:path";
import fs from "node:fs/promises";
import AggregateError from "aggregate-error";
import getError from "./get-error.js";

export default async function ({ pkgRoot }, { cwd }) {
	try {
		const rootDir = pkgRoot ? path.resolve(cwd, String(pkgRoot)) : cwd;
		const filePath = path.join(rootDir, "package.json");
		const content = await fs.readFile(filePath, "utf-8");
		const pkg = JSON.parse(content);

		if (!pkg.name) {
			throw getError("ENOPKGNAME");
		}

		return pkg;
	} catch (error) {
		if (error.code === "ENOENT") {
			throw new AggregateError([getError("ENOPKG")]);
		}

		throw new AggregateError([error]);
	}
}
