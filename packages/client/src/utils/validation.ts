/**
 * Validation Utilities
 *
 * Client-side validation for fail-fast behavior.
 * Server validates too, but catching errors early improves UX.
 */

export const LIMITS = {
    MESSAGE_MAX_LENGTH: 5000,
    USERNAME_MIN_LENGTH: 1,
    USERNAME_MAX_LENGTH: 50,
} as const;

export function validateMessage(content: string): string | null {
    const trimmed = content.trim();
    if (!trimmed) {
        return "Message cannot be empty";
    }
    if (trimmed.length > LIMITS.MESSAGE_MAX_LENGTH) {
        return `Message cannot exceed ${LIMITS.MESSAGE_MAX_LENGTH} characters`;
    }
    return null;
}

export function validateUsername(username: string): string | null {
    const trimmed = username.trim();
    if (!trimmed) {
        return "Username is required";
    }
    if (trimmed.length > LIMITS.USERNAME_MAX_LENGTH) {
        return `Username cannot exceed ${LIMITS.USERNAME_MAX_LENGTH} characters`;
    }
    return null;
}