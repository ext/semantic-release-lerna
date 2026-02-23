import AggregateError from "aggregate-error";
import { execa } from "execa";
import normalizeUrl from "normalize-url";
import { OFFICIAL_REGISTRY } from "./definitions/constants.js";
import getError from "./get-error.js";
import getRegistry from "./get-registry.js";
import { Project } from "./lerna/project.js";
import setNpmrcAuth from "./set-npmrc-auth.js";
import oidcContextEstablished from "./trusted-publishing/oidc-context.js";

function registryIsDefault(registry, DEFAULT_NPM_REGISTRY) {
	return normalizeUrl(registry) === normalizeUrl(DEFAULT_NPM_REGISTRY);
}

async function verifyAuthContextAgainstRegistry(npmrc, registry, context) {
	const { cwd, env, stdout, stderr } = context;

	try {
		const whoamiResult = execa("npm", ["whoami", "--userconfig", npmrc, "--registry", registry], {
			cwd,
			env,
			preferLocal: true,
		});

		whoamiResult.stdout.pipe(stdout, { end: false });
		whoamiResult.stderr.pipe(stderr, { end: false });

		await whoamiResult;
	} catch {
		throw new AggregateError([getError("EINVALIDNPMTOKEN", { registry })]);
	}
}

async function verifyTokenAuth(registry, npmrc, context) {
	const {
		env: { DEFAULT_NPM_REGISTRY = OFFICIAL_REGISTRY },
	} = context;

	if (registryIsDefault(registry, DEFAULT_NPM_REGISTRY)) {
		await verifyAuthContextAgainstRegistry(npmrc, registry, context);
	}
}

export default async function verifyAuth(npmrc, pkg, context) {
	const { cwd, logger } = context;
	const registry = getRegistry(pkg, context);

	const project = new Project(cwd, logger);
	const allPackages = await project.getPackages();
	const packages = allPackages.filter((pkg) => !pkg.private);

	if (await oidcContextEstablished(registry, packages, context)) {
		return;
	}

	await setNpmrcAuth(npmrc, registry, context);

	await verifyTokenAuth(registry, npmrc, context);
}
