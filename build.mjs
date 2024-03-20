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
import { dirname as _dirname_} from "node:path";
import { createRequire as _createRequire_ } from "node:module";
import { fileURLToPath as _fileURLToPath_} from "node:url";

const require = _createRequire_(import.meta.url);
const __filename = _fileURLToPath_(import.meta.url);
const __dirname = _dirname_(__filename);
`,
	},
});
