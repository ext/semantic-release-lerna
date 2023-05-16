module.exports = function (api) {
	if (!api.env("test")) {
		throw new Error("Babel config for running Jest unittests only");
	}

	api.cache(true);
	return {
		plugins: [["babel-plugin-transform-import-meta", { module: "ES6" }]],
		presets: [["@babel/preset-env", { targets: { node: "current" } }]],
	};
};
