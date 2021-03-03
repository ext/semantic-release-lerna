# semantic-release-lerna

[**semantic-release**](https://github.com/semantic-release/semantic-release) plugin to publish lerna managed [npm](https://github.com/lerna/lerna) packages to [npm](https://www.npmjs.com).

This is WORK-IN-PROGRESS so there will most likely be bugs and it as only really been tested under the narrow use-cases I myself need it for.

It is intended to be a drop-in replacement of the `@semantic-release/npm` plugin.

The plugin works in the following way:

- You manage a monorepo using lerna.
- You use semantic-release to automate release handling.
- The plugin will use lerna to check which packages has been updated.
- Package versions are latched (default latching minor and greater), i.e. patches are only published for changed packages but minor and major bumps for all packages. Use `latch` option to configure this.
- Changelog is generated in the project root by semantic-release.

As of now the following features from `@semantic-release/npm` is not supported/implemented:

- `addChannel`.
- `tarball`.
- Only rudimentary support for configuration options.
- Only rudimentary support for authentication verification.
- Only rudimentary support for private packages.

| Step            | Description                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateNotes` | If the plugin option `generateNotes` is true this plugin generate release notes with the commit scope set to a list of affected packages (unless otherwise specificed by the commit message). This option replaces `@semantic-release/release-notes-generator`, do not use both at the same time. |
| `prepare`       | Update the `package.json` version and [create](https://docs.npmjs.com/cli/pack) the npm package tarball.                                                                                                                                                                                          |
| `publish`       | [Publish the npm package](https://docs.npmjs.com/cli/publish) to the registry.                                                                                                                                                                                                                    |

## Install

```bash
$ npm install semantic-release-lerna -D
```

## Usage

The plugin can be configured in the [**semantic-release** configuration file](https://github.com/semantic-release/semantic-release/blob/master/docs/usage/configuration.md#configuration):

```json
{
	"plugins": [
		"@semantic-release/commit-analyzer",
		["semantic-release-lerna", { "generateNotes": true }],
		"@semantic-release/changelog",
		[
			"@semantic-release/git",
			{
				"assets": [
					"CHANGELOG.md",
					"lerna.json",
					"package.json",
					"package-lock.json",
					"lerna.json",
					"packages/*/package.json",
					"packages/*/package-lock.json"
				]
			}
		]
	]
}
```

To use legacy auth set `NPM_USERNAME`, `NPM_PASSWORD` and `NPM_EMAIL`.

## Options

### `npmVerifyAuth`

- Type: `boolean`
- Default: `true`

Set to `false` to disable verifying NPM registry credentials.

### `latch`

- Type: `"major" | "minor" | "patch" | "none"`
- Default: `"minor"`

Latches package versions together.
If the version bump is at least the given version all packages will be bumped regardless if the package has been touched or not.

## Troubleshooting

### Working tree has uncommitted changes

> lerna ERR! EUNCOMMIT Working tree has uncommitted changes, please commit or remove the following changes before continuing:

Configure `@semantic-release/git` to commit `lerna.json` and `package.json` from the package folders.
See example configuration above.
