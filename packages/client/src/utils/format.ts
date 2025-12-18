/**
 * Formatting Utilities
 *
 * Centralized date/time formatting for consistent display across the app.
 */

/**
 * Format timestamp for thread list preview
 * Shows relative time for recent, date for older
 */
export function formatRelativeTime(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    // Less than a minute
    if (diff < 60000) {
        return "Just now";
    }

    // Less than an hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m ago`;
    }

    // Less than a day
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
    }

    // Otherwise show date
    return d.toLocaleDateString();
}

/**
 * Format time for message timestamps
 * Shows HH:MM format
 */
export function formatMessageTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}