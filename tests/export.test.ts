import { describe, expect, it } from "vitest";
import { exportFilename } from "@/lib/export";

describe("exportFilename", () => {
	it("inkover-YYYYMMDD-HHmmss.png 形式で作る", () => {
		const d = new Date(2026, 7, 11, 9, 5, 3); // 2026-08-11 09:05:03
		expect(exportFilename(d)).toBe("inkover-20260811-090503.png");
	});

	it("月日時分秒をゼロ埋めする", () => {
		const d = new Date(2026, 0, 1, 0, 0, 0);
		expect(exportFilename(d)).toBe("inkover-20260101-000000.png");
	});

	it("拡張子を変えられる", () => {
		const d = new Date(2026, 11, 31, 23, 59, 59);
		expect(exportFilename(d, "jpg")).toBe("inkover-20261231-235959.jpg");
	});
});
