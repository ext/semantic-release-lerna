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

## Dependencies

If a package version is bumped all the packages depending (`dependencies`, `devDependencies` and `peerDependencies`) on it will also have the range updated if the range has one of the following formats:

- `1.2.3`
- `^1.2.3`
- `^1.2`
- `^1`

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
          "packages/*/package.json",
          "packages/*/package-lock.json"
        ]
      }
    ]
  ]
}
```

## Options

| Option          | Description                                                                                                                                                                                                           | Default   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `generateNotes` | Set to `true` to enable generating release notes. See `generateNotes` step for more details.                                                                                                                          | `false`   |
| `npmVerifyAuth` | Set to `false` to disable verifying NPM registry credentials.                                                                                                                                                         | `true`    |
| `latch`         | Latches package versions together. If the version bump is at least the given version all packages will be bumped regardless if the package has been touched or not. `"major", "minor", "patch", "prerelease", "none"` | `"minor"` |
| `rootVersion`   | Allow to update version on root `package.json`.                                                                                                                                                                       | `true`    |

## Troubleshooting

### Working tree has uncommitted changes

> lerna ERR! EUNCOMMIT Working tree has uncommitted changes, please commit or remove the following changes before continuing:

Configure `@semantic-release/git` to commit `lerna.json` and `package.json` from the package folders.
See example configuration above.

### Error: Cannot modify immutable object

The conventional changelog packages have mismatching versions.
This plugin supports both `conventional-changelog-writer` v7 and v8 as long as the preset has a matching version.

Assuming you use `conventional-changelog-conventionalcommits` as preset you can verify this with:

    npm ls conventional-changelog-writer conventional-changelog-commits

If the major version of the packages differs you need to explicitly install the correct versions:

    npm install conventional-changelog-writer@8 conventional-changelog-commits@8

Substitute `@8` with `@7` if you need to stay on v7.
Usually you can get away with removing the packages from `package.json` afterwards as long as the lockfile (e.g. `package-lock.json`) still retains the requested versions of the packages.

If you do not have a configured preset `conventional-changelog-angular` is used by default, same rule applies, the major version has to be the same.

Also note that `semantic-release` v24 requires v8 of thte conventional changelog packages.
