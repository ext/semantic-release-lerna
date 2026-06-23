/* This file is managed by @html-validate/eslint-config */
/* Changes may be overwritten */

import defaultConfig from "@html-validate/eslint-config";
import jestConfig from "@html-validate/eslint-config-jest";

export default [
	...defaultConfig({ type: "module" }),

	{
		name: "@html-validate/eslint-config-jest",
		files: ["**/*.spec.[jt]s"],
		ignores: ["cypress/**", "tests/e2e/**"],
		...jestConfig,
	},

	{
		name: "local/integration-test",
		files: ["test/integration.spec.js"],
		rules: {
			"import-x/no-unresolved": "off",
		},
	},
];
