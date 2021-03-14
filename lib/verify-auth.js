const execa = require("execa");
const AggregateError = require("aggregate-error");
const getError = require("@semantic-release/npm/lib/get-error");
const getRegistry = require("@semantic-release/npm/lib/get-registry");
const setNpmrcAuth = require("@semantic-release/npm/lib/set-npmrc-auth");

module.exports = async (npmrc, pkg, context) => {
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
};
