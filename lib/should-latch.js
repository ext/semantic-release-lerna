/* eslint-disable security/detect-unsafe-regex -- technical debt  */
const latchMajor = /^\d+\.0\.0$/;
const latchMinor = /^\d+\.\d+\.0$/;
const latchPatch = /^\d+\.\d+\.\d+$/;
const latchPrerelease = /^\d+\.\d+\.\d+(-(.*\.)?\d+)?$/;

/**
 * Returns true if version should be latched together
 *
 * @param {string} version
 * @param {"major" | "minor" | "patch" | "prerelease" | "none"} latch
 * @returns {boolean}
 */
export function shouldLatch(version, latch) {
	switch (latch) {
		case "major":
			return latchMajor.test(version);
		case "minor":
			return latchMinor.test(version);
		case "patch":
			return latchPatch.test(version);
		case "prerelease":
			return latchPrerelease.test(version);
		default:
			return false;
	}
}
