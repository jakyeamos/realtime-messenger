/**
 * tRPC Client Configuration
 *
 * Sets up the tRPC client with:
 * - HTTP link for queries/mutations
 * - WebSocket link for subscriptions with reconnection logic
 *
 * RESILIENCE FEATURES:
 * - Automatic WebSocket reconnection with exponential backoff
 * - Connection state tracking for UI feedback
 * - Graceful token refresh handling
 *
 * TYPE SAFETY:
 * We import AppRouter from the server package.
 * This gives us full type inference for all procedures.
 */

import { createTRPCReact } from "@trpc/react-query";
import {
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
  TRPCClientError,
} from "@trpc/client";
import type { AppRouter } from "../../../server/src/routers/index.js";

// Create tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();

/**
 * Get auth token from localStorage
 * Used by both HTTP and WebSocket links
 */
function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

/**
 * Connection state management
 * Allows UI to react to WebSocket connection status
 */
type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

type ConnectionListener = (state: ConnectionState) => void;

class ConnectionManager {
  private state: ConnectionState = "disconnected";
  private listeners: Set<ConnectionListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private wsClient: ReturnType<typeof createWSClient> | null = null;

  getState(): ConnectionState {
    return this.state;
  }

  setState(state: ConnectionState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    // Immediately notify of current state
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  incrementReconnectAttempts(): number {
    return ++this.reconnectAttempts;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  shouldReconnect(): boolean {
    return this.reconnectAttempts < this.maxReconnectAttempts;
  }

  setWsClient(client: ReturnType<typeof createWSClient>): void {
    this.wsClient = client;
  }

  /**
   * Force reconnect the WebSocket
   * Useful after login/logout
   */
  reconnect(): void {
    if (this.wsClient) {
      // Close existing connection to trigger reconnect
      this.wsClient.close();
    }
  }
}

export const connectionManager = new ConnectionManager();

/**
 * Calculate reconnection delay with exponential backoff
 * Starts at 1s, doubles each attempt, max 30s
 */
function getReconnectDelay(attempt: number): number {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return delay + jitter;
}

/**
 * WebSocket URL builder
 * Includes auth token as query param
 */
function getWSUrl(): string {
  const token = getAuthToken();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/trpc`;
  return token ? `${wsUrl}?token=${token}` : wsUrl;
}

/**
 * WebSocket client for subscriptions
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection state tracking
 * - Graceful handling of auth token changes
 */
const wsClient = createWSClient({
  url: getWSUrl,

  retryDelayMs: (attemptIndex) => {
    return getReconnectDelay(attemptIndex);
  },

  onOpen: () => {
    console.log("[WS] Connection established");
    connectionManager.setState("connected");
    connectionManager.resetReconnectAttempts();
  },

  onClose: (cause) => {
    console.log("[WS] Connection closed:", cause);

    // Don't reconnect if intentionally closed or no token
    if (!getAuthToken()) {
      connectionManager.setState("disconnected");
      return;
    }

    const attempts = connectionManager.incrementReconnectAttempts();

    if (connectionManager.shouldReconnect()) {
      connectionManager.setState("reconnecting");
      console.log(
          `[WS] Will attempt reconnect #${attempts} in ${getReconnectDelay(attempts)}ms`
      );
    } else {
      connectionManager.setState("disconnected");
      console.error("[WS] Max reconnection attempts reached");
    }
  },
});

// Store reference for manual reconnection
connectionManager.setWsClient(wsClient);

/**
 * tRPC Client
 *
 * Uses splitLink to route:
 * - Subscriptions → WebSocket
 * - Everything else → HTTP
 */
export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      // Route subscriptions to WebSocket, everything else to HTTP
      condition: (op) => op.type === "subscription",

      // WebSocket for subscriptions
      true: wsLink({
        client: wsClient,
      }),

      // HTTP for queries and mutations
      false: httpBatchLink({
        url: "/trpc",
        headers: () => {
          const token = getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    }),
  ],
});

/**
 * Auth helper functions
 * Used by login page and auth context
 */
export const auth = {
  setToken: (token: string) => {
    localStorage.setItem("token", token);
    // Reconnect WebSocket with new token
    connectionManager.reconnect();
  },

  clearToken: () => {
    localStorage.removeItem("token");
    // Disconnect WebSocket
    connectionManager.reconnect();
  },

  getToken: getAuthToken,

  isAuthenticated: () => {
    return !!getAuthToken();
  },
};

/**
 * Error handling utilities
 */
export function isTRPCError(error: unknown): error is TRPCClientError<AppRouter> {
  return error instanceof TRPCClientError;
}

export function getErrorMessage(error: unknown): string {
  if (isTRPCError(error)) {
    // Use the server-provided message if available
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

/**
 * Check if error is due to authentication issues
 */
export function isAuthError(error: unknown): boolean {
  if (isTRPCError(error)) {
    return error.data?.code === "UNAUTHORIZED";
  }
  return false;
}

/**
 * Check if error is a network/connection error
 */
export function isNetworkError(error: unknown): boolean {
  if (isTRPCError(error)) {
    return error.data?.code === "INTERNAL_SERVER_ERROR" || !error.data;
  }
  return false;
}