/* eslint-env jest */

jest.mock("execa");

const execa = require("execa");
const verifyGit = require("./verify-git");

test("should return error if working copy is dirty", async () => {
	execa.mockImplementation(() => ({ stdout: " M file.js\n" }));
	const errors = await verifyGit({});
	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatchObject({
		code: "EDIRTYWC",
		details: `The git working copy must be clean before releasing:

 M file.js
`,
	});
});

test("should return error when working copy has mixed dirty and untracked", async () => {
	execa.mockImplementation(() => ({ stdout: " M file.js\n?? file.c" }));
	const errors = await verifyGit({});
	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatchObject({
		code: "EDIRTYWC",
		details: `The git working copy must be clean before releasing:

 M file.js
?? file.c
`,
	});
});

test("should ignore untracked files", async () => {
	execa.mockImplementation(() => ({ stdout: "?? file.js\n" }));
	const errors = await verifyGit({});
	expect(errors).toHaveLength(0);
});

test("should not return error if working copy is clean", async () => {
	execa.mockImplementation(() => ({ stdout: "" }));
	const errors = await verifyGit({});
	expect(errors).toHaveLength(0);
});
