# semantic-release-lerna

[**semantic-release**](https://github.com/semantic-release/semantic-release) plugin to publish lerna managed [npm](https://github.com/lerna/lerna) packages to [npm](https://www.npmjs.com).

This is WORK-IN-PROGRESS so there will most likely be bugs and it as only really been tested under the narrow use-cases I myself need it for.

It is intended to be a drop-in replacement of the `@semantic-release/npm` plugin.

The plugin works in the following way:

- You manage a monorepo using lerna.
- You use semantic-release to automate release handling.
- The plugin will use lerna to check which packages has been updated.
- Only changed packages gets a version bump.
- Only changed packages is published to NPM.
- Changelog is generated in the project root by semantic-release.
- Major releases will publish new releases of all packages, minor and patch only
  publishes changed.

As of now the following features from `@semantic-release/npm` is not supported/implemented:

- `addChannel`.
- `tarball`.
- Only rudimentary support for configuration options.
- Only rudimentary support for authentication verification.
- Only rudimentary support for private packages.

| Step      | Description                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `prepare` | Update the `package.json` version and [create](https://docs.npmjs.com/cli/pack) the npm package tarball. |
| `publish` | [Publish the npm package](https://docs.npmjs.com/cli/publish) to the registry.                           |

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
    "@semantic-release/release-notes-generator",
    "semantic-release-lerna",
    "@semantic-release/changelog",
    "@semantic-release/git"
  ]
}
```
