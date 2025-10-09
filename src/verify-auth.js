import AggregateError from "aggregate-error";
import { execa } from "execa";
import getError from "./get-error.js";
import getRegistry from "./get-registry.js";
import setNpmrcAuth from "./set-npmrc-auth.js";

export default async function (npmrc, pkg, context) {
	const { cwd, env, stdout, stderr } = context;
	const registry = getRegistry(pkg, context);

	await setNpmrcAuth(npmrc, registry, context);

	try {
		const whoamiResult = execa("npm", ["whoami", "--userconfig", npmrc, "--registry", registry], {
			cwd,
			env,
		});
		whoamiResult.stdout.pipe(stdout, { end: false });
		whoamiResult.stderr.pipe(stderr, { end: false });
		await whoamiResult;
	} catch {
		throw new AggregateError([getError("EINVALIDNPMTOKEN", { registry })]);
	}
}
