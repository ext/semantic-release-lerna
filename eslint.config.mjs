/* This file is managed by @html-validate/eslint-config */
/* Changes may be overwritten */

import defaultConfig from "@html-validate/eslint-config";
import vitestConfig from "@html-validate/eslint-config-vitest";

export default [
	...defaultConfig({ type: "module" }),

	{
		name: "@html-validate/eslint-config-vitest",
		files: ["**/*.spec.[jt]s"],
		ignores: ["cypress/**", "tests/e2e/**"],
		...vitestConfig,
	},

	{
		name: "local/integration-test",
		files: ["test/integration.spec.js"],
		rules: {
			"import-x/no-unresolved": "off",
		},
	},
];
