import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		hookTimeout: 30_000,
		testTimeout: 60_000,
		coverage: {
			enabled: true,
			reporter: ["text", "text-summary", "lcov"],
			include: ["src/**/*.js"],
			exclude: ["**/index.js", "**/*.test.js"],
		},
	},
});
