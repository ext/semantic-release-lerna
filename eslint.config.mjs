/* This file is managed by @html-validate/eslint-config */
/* Changes may be overwritten */

import defaultConfig from "@html-validate/eslint-config";
import jestConfig from "@html-validate/eslint-config-jest";

export default [
	{
		name: "Ignored files",
		ignores: [
			"**/coverage/**",
			"**/dist/**",
			"**/node_modules/**",
			"**/public/assets/**",
			"**/temp/**",
		],
	},
	...defaultConfig,
	...jestConfig,
	{
		/* files which should lint even if project isn't build yet */
		files: ["./*.d.ts", "bin/*.js"],
		rules: {
			"import/export": "off",
			"import/extensions": "off",
			"import/no-unresolved": "off",
		},
	},

	{
		name: "Local overrides",
		rules: {
			"import/extensions": "off",
		},
	},
];
