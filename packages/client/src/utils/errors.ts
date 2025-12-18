/**
 * Error Handling Utilities
 *
 * Consistent error extraction and display.
 */

import { TRPCClientError } from "@trpc/client";

export function getErrorMessage(error: unknown): string {
    if (error instanceof TRPCClientError) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "An unexpected error occurred";
}