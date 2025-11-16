import { getIDToken } from "@actions/core";
import envCi from "env-ci";

import {
	GITHUB_ACTIONS_PROVIDER_NAME,
	GITLAB_PIPELINES_PROVIDER_NAME,
	OFFICIAL_REGISTRY,
} from "../definitions/constants.js";

async function exchangeIdToken(idToken, packageName, logger) {
	/* eslint-disable-next-line n/no-unsupported-features/node-builtins -- we
	 * still support node 20 which supports this properly even if it yields a
	 * warning about being experimental, node 21 drops the warning */
	const response = await fetch(
		`${OFFICIAL_REGISTRY}-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${idToken}` },
		},
	);
	const responseBody = await response.json();

	if (response.ok) {
		logger.log("OIDC token exchange with the npm registry succeeded");

		return responseBody.token;
	}

	logger.log(
		`OIDC token exchange with the npm registry failed: ${response.status} ${responseBody.message}`,
	);

	return undefined;
}

async function exchangeGithubActionsToken(packageName, logger) {
	let idToken;

	logger.log(`Verifying OIDC context for publishing "${packageName}" from GitHub Actions`);

	try {
		idToken = await getIDToken("npm:registry.npmjs.org");
	} catch (e) {
		logger.log(`Retrieval of GitHub Actions OIDC token failed: ${e.message}`);
		logger.log("Have you granted the `id-token: write` permission to this workflow?");

		return undefined;
	}

	return exchangeIdToken(idToken, packageName, logger);
}

async function exchangeGitlabPipelinesToken(packageName, logger) {
	const idToken = process.env.NPM_ID_TOKEN;

	logger.log(`Verifying OIDC context for publishing "${packageName}" from GitLab Pipelines`);

	if (!idToken) {
		logger.log(`Retrieval of GitLab Pipelines OIDC token failed`);
		logger.log("Have you set the `id_tokens.NPM_ID_TOKEN` property to this pipeline job?");

		return undefined;
	}

	return exchangeIdToken(idToken, packageName, logger);
}

/**
 * @param {import("../lerna/package.js").Package} pkg - Package to verify auth for.
 */
export default function exchangeToken(pkg, { logger }) {
	const { name: ciProviderName } = envCi();

	if (GITHUB_ACTIONS_PROVIDER_NAME === ciProviderName) {
		return exchangeGithubActionsToken(pkg.name, logger);
	}

	if (GITLAB_PIPELINES_PROVIDER_NAME === ciProviderName) {
		return exchangeGitlabPipelinesToken(pkg.name, logger);
	}

	return undefined;
}
