/**
 * tRPC Configuration
 * 
 * This file sets up the tRPC instance, context, and base procedures.
 * 
 * KEY CONCEPTS:
 * 
 * 1. CONTEXT: Data available to all procedures (like the current user)
 *    - Created fresh for each request
 *    - Contains prisma client and authenticated user (if any)
 * 
 * 2. PROCEDURES: The building blocks of your API
 *    - publicProcedure: Anyone can call (e.g., login)
 *    - protectedProcedure: Must be authenticated (e.g., send message)
 * 
 * 3. MIDDLEWARE: Functions that run before procedures
 *    - Used here to check authentication
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

// JWT payload type
interface JWTPayload {
  userId: string;
  username: string;
}

// Context type - available in all procedures
export interface Context {
  prisma: typeof prisma;
  user: JWTPayload | null;
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
}

/**
 * Verify JWT and return payload
 */
function verifyToken(token: string): JWTPayload | null {
  try {
    const secret = process.env.JWT_SECRET || "development-secret";
    return jwt.verify(token, secret) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Create context for Express HTTP requests
 */
export function createExpressContext({
  req,
}: CreateExpressContextOptions): Context {
  const token = extractToken(req.headers.authorization);
  const user = token ? verifyToken(token) : null;

  return {
    prisma,
    user,
  };
}

/**
 * Create context for WebSocket connections
 */
export function createWSContext(opts: CreateWSSContextFnOptions): Context {
  // Token can come from connection params or URL query
  let token: string | null = null;

  try {
    // Try connection params first
    if (opts.info?.connectionParams?.token) {
      token = opts.info.connectionParams.token as string;
    }
    // Fallback to URL query params
    else if (opts.req?.url) {
      token = new URL(opts.req.url, "http://localhost").searchParams.get("token");
    }
  } catch {
    // Ignore parsing errors
  }

  const user = token ? verifyToken(token) : null;

  return {
    prisma,
    user,
  };
}

// Initialize tRPC with our context type
const t = initTRPC.context<Context>().create();

// Export reusable router and procedure helpers
export const router = t.router;
export const middleware = t.middleware;

/**
 * Public procedure - no authentication required
 * Use for: login, health checks, public data
 */
export const publicProcedure = t.procedure;

/**
 * Authentication middleware
 * Checks if user is present in context, throws if not
 */
const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }

  // Pass along the user (now guaranteed to exist)
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // TypeScript now knows user is not null
    },
  });
});

/**
 * Protected procedure - requires authentication
 * Use for: anything that needs a logged-in user
 */
export const protectedProcedure = t.procedure.use(isAuthenticated);
