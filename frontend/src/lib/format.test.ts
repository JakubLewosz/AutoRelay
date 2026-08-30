import { describe, expect, it, vi } from "vitest";
import { formatDateTime, formatRelativeTime } from "./format";

describe("English date formatting", () => {
  it("uses English month and relative-time labels regardless of device locale", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-30T10:03:00Z").getTime());

    expect(formatDateTime("2026-08-30T10:00:00Z")).toContain("Aug");
    expect(formatRelativeTime("2026-08-30T10:00:00Z")).toBe("3 minutes ago");
  });
});
