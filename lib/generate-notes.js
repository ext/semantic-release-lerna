const { format } = require("url");
const getStream = require("get-stream");
const intoStream = require("into-stream");
const parser = require("conventional-commits-parser").sync;
const writer = require("conventional-changelog-writer");
const filter = require("conventional-commits-filter");
const readPkgUp = require("read-pkg-up");
const debug = require("debug")("semantic-release:release-notes-generator");
const loadChangelogConfig = require("@semantic-release/release-notes-generator/lib/load-changelog-config");
const HOSTS_CONFIG = require("@semantic-release/release-notes-generator/lib/hosts-config");
const { makeDiffPredicate } = require("@lerna/collect-updates/lib/make-diff-predicate");
const { Project } = require("@lerna/project");

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
/* eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- technical debt */
async function generateNotes(pluginConfig, context) {
	const { commits, lastRelease, nextRelease, options, cwd, logger } = context;
	const { generateNotes = false } = pluginConfig;

	if (!generateNotes) {
		logger.log(`Release notes scope disabled, skipping`);
		return "";
	}

	const repositoryUrl = options.repositoryUrl.replace(/\.git$/i, "");
	const { parserOpts, writerOpts } = await loadChangelogConfig(pluginConfig, context);

	const project = new Project(cwd);
	const packages = await project.getPackages();

	function fillScope(parsedCommit) {
		if (parsedCommit.scope) {
			return parsedCommit;
		}

		const hasDiff = makeDiffPredicate(`${parsedCommit.hash}^!`, { cwd });
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
			.filter(({ message, hash }) => {
				if (!message.trim()) {
					debug("Skip commit %s with empty message", hash);
					return false;
				}

				return true;
			})
			.map((rawCommit) =>
				fillScope({
					...rawCommit,
					...parser(rawCommit.message, { referenceActions, issuePrefixes, ...parserOpts }),
				})
			)
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
		packageData: ((await readPkgUp({ normalize: false, cwd })) || {}).packageJson,
	};
	const userConfig = {
		host: hostConfig,
		linkCompare,
		linkReferences,
		commit: commitConfig,
		issue: issueConfig,
	};
	const changelogContext = { ...defaultContext, ...userConfig };

	debug("version: %o", changelogContext.version);
	debug("host: %o", changelogContext.hostname);
	debug("owner: %o", changelogContext.owner);
	debug("repository: %o", changelogContext.repository);
	debug("previousTag: %o", changelogContext.previousTag);
	debug("currentTag: %o", changelogContext.currentTag);
	debug("linkReferences: %o", changelogContext.linkReferences);
	debug("issue: %o", changelogContext.issue);
	debug("commit: %o", changelogContext.commit);

	return getStream(intoStream.object(parsedCommits).pipe(writer(changelogContext, writerOpts)));
}

module.exports = generateNotes;
