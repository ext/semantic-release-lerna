/* eslint-env jest */

const semver = require("semver");
const shouldLatch = require("./should-latch");

const version = "1.0.0";

describe("latch none", () => {
	it.each`
		bump            | result   | version    | next
		${"major"}      | ${false} | ${version} | ${semver.inc(version, "major")}
		${"minor"}      | ${false} | ${version} | ${semver.inc(version, "minor")}
		${"patch"}      | ${false} | ${version} | ${semver.inc(version, "patch")}
		${"prerelease"} | ${false} | ${version} | ${semver.inc(version, "prerelease")}
	`("should return $result when version bump is $bump ($version -> $next)", ({ result, next }) => {
		expect.assertions(1);
		expect(shouldLatch(next, "none")).toBe(result);
	});
});

describe("latch major", () => {
	it.each`
		bump            | result   | version    | next
		${"major"}      | ${true}  | ${version} | ${semver.inc(version, "major")}
		${"minor"}      | ${false} | ${version} | ${semver.inc(version, "minor")}
		${"patch"}      | ${false} | ${version} | ${semver.inc(version, "patch")}
		${"prerelease"} | ${false} | ${version} | ${semver.inc(version, "prerelease")}
	`("should return $result when version bump is $bump ($version -> $next)", ({ result, next }) => {
		expect.assertions(1);
		expect(shouldLatch(next, "major")).toBe(result);
	});
});

describe("latch minor", () => {
	it.each`
		bump            | result   | version    | next
		${"major"}      | ${true}  | ${version} | ${semver.inc(version, "major")}
		${"minor"}      | ${true}  | ${version} | ${semver.inc(version, "minor")}
		${"patch"}      | ${false} | ${version} | ${semver.inc(version, "patch")}
		${"prerelease"} | ${false} | ${version} | ${semver.inc(version, "prerelease")}
	`("should return $result when version bump is $bump ($version -> $next)", ({ result, next }) => {
		expect.assertions(1);
		expect(shouldLatch(next, "minor")).toBe(result);
	});
});

describe("latch patch", () => {
	it.each`
		bump            | result   | version    | next
		${"major"}      | ${true}  | ${version} | ${semver.inc(version, "major")}
		${"minor"}      | ${true}  | ${version} | ${semver.inc(version, "minor")}
		${"patch"}      | ${true}  | ${version} | ${semver.inc(version, "patch")}
		${"prerelease"} | ${false} | ${version} | ${semver.inc(version, "prerelease")}
	`("should return $result when version bump is $bump ($version -> $next)", ({ result, next }) => {
		expect.assertions(1);
		expect(shouldLatch(next, "patch")).toBe(result);
	});
});
