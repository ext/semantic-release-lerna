require("@html-validate/eslint-config/patch/modern-module-resolution");

module.exports = {
	extends: ["@html-validate"],

	rules: {
		"security/detect-object-injection": "off",
	},

	overrides: [
		{
			files: "*.test.[jt]s",
			excludedFiles: ["cypress/**", "tests/e2e/**"],
			extends: ["@html-validate/jest"],
		},
	],
};
