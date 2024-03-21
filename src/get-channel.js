import validRange from "semver/ranges/valid";

export default function (channel) {
	return channel ? (validRange(channel) ? `release-${channel}` : channel) : "latest";
}
