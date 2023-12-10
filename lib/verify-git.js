import { execa } from "execa";
import getError from "./get-error.js";

async function isDirty({ env }) {
	const { stdout: wc } = await execa("git", ["status", "--porcelain"], { env });
	const files = wc.split("\n").filter((line) => line.length > 0);
	const tracked = files.filter((line) => !/^\?\?/.test(line));
	return tracked.length > 0 ? { files } : null;
}

const VALIDATORS = {
	dirtyWc: isDirty,
};

export default async function verifyGit(context) {
	const result = await Promise.all(
		Object.entries(VALIDATORS).map(async ([name, validator]) => {
			const details = await validator(context);
			return [name, details];
		}),
	);
	return result
		.filter(([, details]) => details)
		.map(([name, details]) => getError(`E${name.toUpperCase()}`, details));
}
