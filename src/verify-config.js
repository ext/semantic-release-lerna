import getError from "./get-error.js";

const isBoolean = (value) => value === true || value === false;
const isNil = (value) => value == null;
const isString = (value) => typeof value === "string";
const isNonEmptyString = (value) => isString(value) && value.trim();

const VALIDATORS = {
	npmPublish: isBoolean,
	tarballDir: isNonEmptyString,
	pkgRoot: isNonEmptyString,
};

export default function verifyConfig({ npmPublish, tarballDir, pkgRoot }) {
	return Object.entries({ npmPublish, tarballDir, pkgRoot }).reduce(
		(errors, [option, value]) =>
			!isNil(value) && !VALIDATORS[option](value)
				? [...errors, getError(`EINVALID${option.toUpperCase()}`, { [option]: value })]
				: errors,
		[],
	);
}
