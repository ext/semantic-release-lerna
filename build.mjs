import fs from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));
const { externalDependencies } = pkg;

build({
	entryPoints: ["src/index.js"],
	bundle: true,
	outdir: "dist",
	platform: "node",
	target: "node18",
	format: "esm",
	logLevel: "info",
	external: externalDependencies,
	banner: {
		js: `
import { createRequire as _createRequire_ } from "node:module";
const require = _createRequire_(import.meta.url);
`,
	},
});
