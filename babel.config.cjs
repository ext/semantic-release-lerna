module.exports = function (api) {
	if (!api.env("test")) {
		throw new Error("Babel config for running Jest unittests only");
	}

	api.cache(true);
	return {
		presets: ["@babel/preset-env"],
	};
};
