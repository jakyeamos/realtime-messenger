import { describe, it, expect } from "vitest";
import { formatRelativeTime, formatMessageTime } from "../format";

describe("formatRelativeTime", () => {
    it("returns 'Just now' for times less than a minute ago", () => {
        const now = new Date();
        expect(formatRelativeTime(now)).toBe("Just now");
    });

    it("returns minutes ago for times less than an hour", () => {
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
        expect(formatRelativeTime(thirtyMinsAgo)).toBe("30m ago");
    });

    it("returns hours ago for times less than a day", () => {
        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
        expect(formatRelativeTime(fiveHoursAgo)).toBe("5h ago");
    });

    it("returns date for times more than a day ago", () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(twoDaysAgo);
        expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\.\d{1,2}\.\d{4}/);
    });
});

describe("formatMessageTime", () => {
    it("returns time in HH:MM format", () => {
        const date = new Date("2024-01-15T14:30:00");
        const result = formatMessageTime(date);
        expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
});