/**
 * Root Router
 * 
 * Combines all sub-routers into a single router.
 * This is what gets exposed to the frontend.
 * 
 * The type export (AppRouter) is crucial - it's what
 * enables end-to-end type safety with tRPC.
 */

import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { threadRouter } from "./thread.js";
import { messageRouter } from "./message.js";

export const appRouter = router({
  auth: authRouter,
  thread: threadRouter,
  message: messageRouter,
});

// Export type for frontend consumption
// This is THE key to tRPC's type safety
export type AppRouter = typeof appRouter;
