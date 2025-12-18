import { describe, it, expect } from "vitest";
import { validateMessage, validateUsername, LIMITS } from "../validation";

describe("validateMessage", () => {
    it("returns error for empty message", () => {
        expect(validateMessage("")).toBe("Message cannot be empty");
        expect(validateMessage("   ")).toBe("Message cannot be empty");
    });

    it("returns null for valid message", () => {
        expect(validateMessage("Hello")).toBeNull();
    });

    it("returns error for message exceeding max length", () => {
        const longMessage = "a".repeat(LIMITS.MESSAGE_MAX_LENGTH + 1);
        expect(validateMessage(longMessage)).toBe(
            `Message cannot exceed ${LIMITS.MESSAGE_MAX_LENGTH} characters`
        );
    });
});

describe("validateUsername", () => {
    it("returns error for empty username", () => {
        expect(validateUsername("")).toBe("Username is required");
    });

    it("returns null for valid username", () => {
        expect(validateUsername("alice")).toBeNull();
    });

    it("returns error for username exceeding max length", () => {
        const longUsername = "a".repeat(LIMITS.USERNAME_MAX_LENGTH + 1);
        expect(validateUsername(longUsername)).toBe(
            `Username cannot exceed ${LIMITS.USERNAME_MAX_LENGTH} characters`
        );
    });
});