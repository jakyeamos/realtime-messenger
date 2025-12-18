/**
 * Shared Type Definitions
 *
 * Re-export commonly used types for cleaner imports.
 */

export interface User {
    id: string;
    username: string;
}

export interface Message {
    id: string;
    content: string;
    createdAt: Date | string;
    sender: User;
}

export interface Thread {
    id: string;
    updatedAt: Date | string;
    participants: User[];
    lastMessage: Message | null;
}