/* This file is managed by @html-validate/eslint-config */
/* Changes may be overwritten */

import defaultConfig from "@html-validate/eslint-config";
import vitestConfig from "@html-validate/eslint-config-vitest";

export default [
	...defaultConfig({
		type: "module",
	}),

	vitestConfig(),

	{
		name: "local/integration-test",
		files: ["test/integration.spec.js"],
		rules: {
			"import-x/no-unresolved": "off",
		},
	},
];
