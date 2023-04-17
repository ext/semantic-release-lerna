const { readFile } = require("fs/promises");
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
		console.log(registry);
		console.log(context);
		console.log(npmrc);
		const file = await readFile(npmrc, "utf8");
		console.log(file);
		
		console.log("verify-auth: env", env)


		const whoamiResult = execa("npm", ["whoami", "--userconfig", npmrc, "--registry", registry], {
			cwd,
			env,
		});
		whoamiResult.stdout.on("data", (data) => {
			console.log(`Received out ${data}`);
		});
		whoamiResult.stderr.on("data", (data) => {
			console.log(`Received error ${data}`);
		});
		whoamiResult.stdout.pipe(stdout, { end: false });
		whoamiResult.stderr.pipe(stderr, { end: false });
		await whoamiResult;
	} catch {
		throw new AggregateError([getError("EINVALIDNPMTOKEN", { registry })]);
	}
};
