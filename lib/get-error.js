import SemanticReleaseError from "@semantic-release/error";
import * as ERROR_DEFINITIONS from "./definitions/errors.js";

export default function (code, ctx = {}) {
	/* eslint-disable-next-line import/namespace -- this is how upstream does it */
	const { message, details } = ERROR_DEFINITIONS[code](ctx);
	return new SemanticReleaseError(message, code, details);
}
