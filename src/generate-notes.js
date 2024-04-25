import { dirname } from "node:path";
import { fileURLToPath, format } from "node:url";
import conventionalChangelogAngular from "conventional-changelog-angular";
import getStream from "get-stream";
import importFrom from "import-from-esm";
import intoStream from "into-stream";
import { sync as parser } from "conventional-commits-parser";
import writer from "conventional-changelog-writer";
import filter from "conventional-commits-filter";
import { readPackageUp } from "read-package-up";
import { Project } from "./lerna/project";
import { makeDiffPredicate } from "./utils/index.js";
import HOSTS_CONFIG from "./hosts-config.js";

/**
 * Load `conventional-changelog-parser` options. Handle presets that return either a `Promise<Array>` or a `Promise<Function>`.
 *
 * @param {Object} pluginConfig The plugin configuration.
 * @param {Object} pluginConfig.preset conventional-changelog preset ('angular', 'atom', 'codemirror', 'ember', 'eslint', 'express', 'jquery', 'jscs', 'jshint')
 * @param {string} pluginConfig.config Requireable npm package with a custom conventional-changelog preset
 * @param {Object} pluginConfig.parserOpts Additional `conventional-changelog-parser` options that will overwrite ones loaded by `preset` or `config`.
 * @param {Object} pluginConfig.writerOpts Additional `conventional-changelog-writer` options that will overwrite ones loaded by `preset` or `config`.
 * @param {Object} context The semantic-release context.
 * @param {Array<Object>} context.commits The commits to analyze.
 * @param {String} context.cwd The current working directory.
 *
 * @return {Promise<Object>} a `Promise` that resolve to the `conventional-changelog-core` config.
 */
async function loadChangelogConfig(pluginConfig, context) {
	const { preset, config, parserOpts, writerOpts, presetConfig } = pluginConfig;
	const { cwd } = context;
	let loadedConfig;
	const __dirname = dirname(fileURLToPath(import.meta.url));

	if (preset) {
		const presetPackage = `conventional-changelog-${preset.toLowerCase()}`;
		loadedConfig = await (
			(await importFrom.silent(__dirname, presetPackage)) || (await importFrom(cwd, presetPackage))
		)(presetConfig);
	} else if (config) {
		loadedConfig = await (
			(await importFrom.silent(__dirname, config)) || (await importFrom(cwd, config))
		)();
	} else {
		loadedConfig = await conventionalChangelogAngular();
	}

	return {
		parserOpts: { ...loadedConfig.parserOpts, ...parserOpts },
		writerOpts: { ...loadedConfig.writerOpts, ...writerOpts },
	};
}

/**
 * Generate the changelog for all the commits in `options.commits`.
 *
 * @param {Object} pluginConfig The plugin configuration.
 * @param {String} pluginConfig.preset conventional-changelog preset ('angular', 'atom', 'codemirror', 'ember', 'eslint', 'express', 'jquery', 'jscs', 'jshint').
 * @param {String} pluginConfig.config Requierable npm package with a custom conventional-changelog preset
 * @param {Object} pluginConfig.parserOpts Additional `conventional-changelog-parser` options that will overwrite ones loaded by `preset` or `config`.
 * @param {Object} pluginConfig.writerOpts Additional `conventional-changelog-writer` options that will overwrite ones loaded by `preset` or `config`.
 * @param {Object} context The semantic-release context.
 * @param {Array<Object>} context.commits The commits to analyze.
 * @param {Object} context.lastRelease The last release with `gitHead` corresponding to the commit hash used to make the last release and `gitTag` corresponding to the git tag associated with `gitHead`.
 * @param {Object} context.nextRelease The next release with `gitHead` corresponding to the commit hash used to make the  release, the release `version` and `gitTag` corresponding to the git tag associated with `gitHead`.
 * @param {Object} context.options.repositoryUrl The git repository URL.
 *
 * @returns {String} The changelog for all the commits in `context.commits`.
 */
/* eslint-disable-next-line complexity -- technical debt */
export async function generateNotes(pluginConfig, context) {
	const { commits, lastRelease, nextRelease, options, cwd, logger } = context;
	const { generateNotes = false } = pluginConfig;

	if (!generateNotes) {
		logger.log(`Release notes scope disabled, skipping`);
		return "";
	}

	const repositoryUrl = options.repositoryUrl.replace(/\.git$/i, "");
	const { parserOpts, writerOpts } = await loadChangelogConfig(pluginConfig, context);

	const project = new Project(cwd, logger);
	const packages = await project.getPackages();

	function fillScope(parsedCommit) {
		if (parsedCommit.scope) {
			return parsedCommit;
		}

		const hasDiff = makeDiffPredicate(
			`${parsedCommit.hash}^!`,
			{ cwd },
			{ logger, ignoreChanges: [] },
		);
		const scope = packages.filter((pkg) => !pkg.private && hasDiff(pkg)).map((pkg) => pkg.name);
		if (scope.length > 0) {
			parsedCommit.scope = scope.join(", ");
		}

		return parsedCommit;
	}

	const [match, auth, host, path] =
		/* eslint-disable-next-line security/detect-unsafe-regex -- technical debt  */
		/^(?!.+:\/\/)(?:(?<auth>.*)@)?(?<host>.*?):(?<path>.*)$/.exec(repositoryUrl) || [];
	const authString = auth ? `${auth}@` : "";
	const url = new URL(match ? `ssh://${authString}${host}/${path}` : repositoryUrl);
	const { hostname, pathname } = url;
	let { port, protocol } = url;
	port = protocol.includes("ssh") ? "" : port;
	protocol = protocol && /http[^s]/.test(protocol) ? "http" : "https";
	/* eslint-disable-next-line security/detect-unsafe-regex -- technical debt  */
	const [, owner, repository] = /^\/(?<owner>[^/]+)?\/?(?<repository>.+)?$/.exec(pathname);

	const { issue, commit, referenceActions, issuePrefixes } =
		Object.values(HOSTS_CONFIG).find((conf) => conf.hostname === hostname) || HOSTS_CONFIG.default;
	const parsedCommits = filter(
		commits
			.filter(({ message }) => {
				if (!message.trim()) {
					return false;
				}

				return true;
			})
			.map((rawCommit) =>
				fillScope({
					...rawCommit,
					...parser(rawCommit.message, { referenceActions, issuePrefixes, ...parserOpts }),
				}),
			),
	);
	const previousTag = lastRelease.gitTag || lastRelease.gitHead;
	const currentTag = nextRelease.gitTag || nextRelease.gitHead;
	const {
		host: hostConfig,
		linkCompare,
		linkReferences,
		commit: commitConfig,
		issue: issueConfig,
	} = pluginConfig;
	const defaultContext = {
		version: nextRelease.version,
		host: format({ protocol, hostname, port }),
		owner,
		repository,
		previousTag,
		currentTag,
		linkCompare: currentTag && previousTag,
		issue,
		commit,
		packageData: ((await readPackageUp({ normalize: false, cwd })) || {}).packageJson,
	};
	const userConfig = {
		host: hostConfig,
		linkCompare,
		linkReferences,
		commit: commitConfig,
		issue: issueConfig,
	};
	const changelogContext = { ...defaultContext, ...userConfig };

	return getStream(intoStream.object(parsedCommits).pipe(writer(changelogContext, writerOpts)));
}
