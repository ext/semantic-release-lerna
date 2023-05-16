jest.mock("execa");

import execa from "execa";
import verifyGit from "./verify-git";

it("should return error if working copy is dirty", async () => {
	expect.assertions(2);
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

it("should return error when working copy has mixed dirty and untracked", async () => {
	expect.assertions(2);
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

it("should ignore untracked files", async () => {
	expect.assertions(1);
	execa.mockImplementation(() => ({ stdout: "?? file.js\n" }));
	const errors = await verifyGit({});
	expect(errors).toHaveLength(0);
});

it("should not return error if working copy is clean", async () => {
	expect.assertions(1);
	execa.mockImplementation(() => ({ stdout: "" }));
	const errors = await verifyGit({});
	expect(errors).toHaveLength(0);
});
