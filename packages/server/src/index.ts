/**
 * Server Entry Point
 * 
 * Sets up Express server with:
 * - tRPC HTTP adapter (for queries/mutations)
 * - tRPC WebSocket adapter (for subscriptions)
 * 
 * ARCHITECTURE:
 * 
 * HTTP requests (port 3000):
 *   - POST /trpc/* → tRPC procedures (queries/mutations)
 * 
 * WebSocket (same port, upgrade):
 *   - ws://localhost:3000 → tRPC subscriptions
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { appRouter } from "./routers/index.js";
import { createExpressContext, createWSContext } from "./trpc.js";

// Configuration
const PORT = process.env.PORT || 3000;

// Create Express app
const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"], // Vite dev server
    credentials: true,
  })
);
app.use(express.json());

// Health check endpoint
app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// tRPC HTTP handler
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: createExpressContext,
    onError: ({ path, error }) => {
      console.error(`[tRPC] Error in ${path}:`, error.message);
    },
  })
);

// Create HTTP server
const httpServer = createServer(app);

// Create WebSocket server for subscriptions
const wss = new WebSocketServer({
  server: httpServer,
  path: "/trpc",
});

// Apply tRPC WebSocket handler
const wsHandler = applyWSSHandler({
  wss,
  router: appRouter,
  createContext: createWSContext,
  onError: ({ path, error }) => {
    console.error(`[tRPC WS] Error in ${path}:`, error.message);
  },
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
🚀 Server ready!

   HTTP:      http://localhost:${PORT}
   WebSocket: ws://localhost:${PORT}/trpc
   tRPC:      http://localhost:${PORT}/trpc

📝 Test users (password: password123):
   - alice
   - bob
   - charlie

💡 Run 'pnpm db:seed' if you haven't already
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  wsHandler.broadcastReconnectNotification();
  wss.close();
  httpServer.close();
});
