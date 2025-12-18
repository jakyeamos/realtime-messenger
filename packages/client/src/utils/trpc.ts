/**
 * tRPC Client Configuration
 * 
 * Sets up the tRPC client with:
 * - HTTP link for queries/mutations
 * - WebSocket link for subscriptions
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
 * WebSocket client for subscriptions
 * 
 * Note: We pass the token via connection params
 * since headers don't work with WebSocket upgrade
 */
/**
 * WebSocket client for subscriptions
 *
 * Pass token via URL query param since connectionParams
 * can be unreliable with some WebSocket setups
 */
function getWSUrl() {
  const token = getAuthToken();
  const wsUrl = `ws://${window.location.host}/trpc`;
  return token ? `${wsUrl}?token=${token}` : wsUrl;
}

const wsClient = createWSClient({
  url: getWSUrl,
  onClose: (cause) => {
    console.log("[WS] Connection closed:", cause);
  },
  onOpen: () => {
    console.log("[WS] Connection opened");
  },
});

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
    // Note: In a production app, you'd want to handle this more gracefully
  },

  clearToken: () => {
    localStorage.removeItem("token");
  },

  getToken: getAuthToken,

  isAuthenticated: () => {
    return !!getAuthToken();
  },
};
