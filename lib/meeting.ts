/**
 * 会議ツールの判定。
 *
 * 権限を増やさずに実現するため、background から全タブの URL を監視する方式は
 * 採らない（tabs 権限が必要になり「権限 3 つだけ」の公約が崩れる）。
 * 既に注入されている content script 側で location を見るだけに留める。
 */

export type MeetingService = {
	id: string;
	label: string;
	/** 画面共有時の注意点の i18n キー。会議ツールごとに癖があるので個別に出す。 */
	tipKey: string;
};

const SERVICES: {
	match: (host: string, path: string) => boolean;
	service: MeetingService;
}[] = [
	{
		match: (h) => h === "meet.google.com",
		service: {
			id: "meet",
			label: "Google Meet",
			// Meet の注釈機能は有料 Workspace 限定。無料プランの利用者にとっては
			// inkover がその穴を埋める形になるので、そこに触れる。
			tipKey: "meetingTip",
		},
	},
	{
		match: (h) => h.endsWith("zoom.us") || h.endsWith("zoom.com"),
		service: {
			id: "zoom",
			label: "Zoom",
			tipKey: "meetingTip",
		},
	},
	{
		match: (h) => h === "teams.microsoft.com" || h === "teams.live.com",
		service: {
			id: "teams",
			label: "Microsoft Teams",
			tipKey: "meetingTip",
		},
	},
	{
		match: (h) => h.endsWith("webex.com"),
		service: {
			id: "webex",
			label: "Webex",
			tipKey: "meetingTip",
		},
	},
	{
		match: (h) => h === "app.slack.com" || h.endsWith(".slack.com"),
		service: {
			id: "slack",
			label: "Slack",
			tipKey: "meetingTipSlack",
		},
	},
];

/**
 * 現在のページが会議ツールなら、その情報を返す。
 *
 * 会議ツール「そのもの」の上で描いても、共有されているのは別タブなので
 * 相手には映らない。ここで気づいてもらうのが目的。
 */
export function detectMeetingService(href: string): MeetingService | null {
	let host: string;
	let path: string;
	try {
		const url = new URL(href);
		host = url.hostname.toLowerCase();
		path = url.pathname;
	} catch {
		return null;
	}
	for (const entry of SERVICES) {
		if (entry.match(host, path)) return entry.service;
	}
	return null;
}
