import validRange from "semver/ranges/valid";

export default function (channel) {
	if (channel) {
		return validRange(channel) ? `release-${channel}` : channel;
	} else {
		return "latest";
	}
}
