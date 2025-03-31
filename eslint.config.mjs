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
			"**/out/**",
			"**/public/assets/**",
			"**/temp/**",
		],
	},

	...defaultConfig,

	{
		name: "@html-validate/eslint-config-jest",
		files: ["**/*.spec.[jt]s"],
		ignores: ["cypress/**", "tests/e2e/**"],
		...jestConfig,
	},

	{
		name: "local",
		rules: {
			"import/extensions": "off",
		},
	},

	{
		name: "local/jest",
		files: ["**/*.spec.[jt]s"],
		rules: {
			"import/no-unresolved": "off",
		},
	},
];
