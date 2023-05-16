import { execa } from "execa";
import AggregateError from "aggregate-error";
import getError from "@semantic-release/npm/lib/get-error.js";
import getRegistry from "@semantic-release/npm/lib/get-registry.js";
import setNpmrcAuth from "@semantic-release/npm/lib/set-npmrc-auth.js";

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
