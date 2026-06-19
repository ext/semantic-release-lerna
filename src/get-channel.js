import validRange from "semver/ranges/valid";

export default function getChannel(channel) {
	if (channel) {
		return validRange(channel) ? `release-${channel}` : channel;
	}
	return "latest";
}
