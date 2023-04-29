require("@html-validate/eslint-config/patch/modern-module-resolution");

module.exports = {
	root: true,
	extends: ["@html-validate"],

	overrides: [
		{
			files: "*.test.[jt]s",
			extends: ["@html-validate/jest"],
		},
	],
};
