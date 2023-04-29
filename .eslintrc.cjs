/* This file is managed by @html-validate/eslint-config */
/* Changes may be overwritten */

require("@html-validate/eslint-config/patch/modern-module-resolution");

module.exports = {
	root: true,
	extends: ["@html-validate"],

	overrides: [
		{
			/* ensure cjs and mjs files are linted too */
			files: ["*.cjs", "*.mjs"],
		},
		{
			files: "*.test.[jt]s",
			extends: ["@html-validate/jest"],
		},
		{
			/* files which should lint even if project isn't build yet */
			files: ["./*.d.ts", "bin/*.js"],
			rules: {
				"import/export": "off",
				"import/extensions": "off",
				"import/no-unresolved": "off",
			},
		},
	],
};
