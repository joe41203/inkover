import { describe, expect, it } from "vitest";
import { detectMeetingService } from "@/lib/meeting";

describe("detectMeetingService", () => {
	it("Google Meet を判定する", () => {
		expect(detectMeetingService("https://meet.google.com/abc-defg-hij")?.id).toBe(
			"meet",
		);
	});

	it("Zoom を判定する（サブドメイン込み）", () => {
		expect(detectMeetingService("https://us02web.zoom.us/wc/123/join")?.id).toBe(
			"zoom",
		);
		expect(detectMeetingService("https://zoom.us/j/123")?.id).toBe("zoom");
	});

	it("Teams を判定する", () => {
		expect(detectMeetingService("https://teams.microsoft.com/_#/pre-join")?.id).toBe(
			"teams",
		);
	});

	it("Webex を判定する", () => {
		expect(detectMeetingService("https://acme.webex.com/meet/x")?.id).toBe(
			"webex",
		);
	});

	it("Slack を判定する", () => {
		expect(detectMeetingService("https://app.slack.com/client/T1/C1")?.id).toBe(
			"slack",
		);
	});

	it("会議ツールでないページは null", () => {
		expect(detectMeetingService("https://example.com/")).toBeNull();
		expect(detectMeetingService("https://github.com/")).toBeNull();
	});

	it("紛らわしいドメインを誤判定しない", () => {
		// 別サービスを巻き込まないこと
		expect(detectMeetingService("https://notzoom.us.example.com/")).toBeNull();
		expect(detectMeetingService("https://meet.google.com.evil.test/")).toBeNull();
	});

	it("不正な URL でも落ちない", () => {
		expect(detectMeetingService("not a url")).toBeNull();
		expect(detectMeetingService("")).toBeNull();
	});
});
