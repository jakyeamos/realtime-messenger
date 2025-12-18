/**
 * Message Router
 *
 * Handles sending messages and real-time updates.
 *
 * PROCEDURES:
 * - send: Send a message to a thread
 * - onNew: Subscribe to new messages (WebSocket)
 * - onAnyNew: Subscribe to messages in user's threads
 *
 * SECURITY:
 * - All procedures require authentication (protectedProcedure)
 * - All procedures verify user is a participant in the thread
 *
 * REAL-TIME EXPLAINED:
 *
 * The subscription uses an EventEmitter pattern:
 * 1. When a message is sent, we emit an event
 * 2. Active subscriptions listening to that thread receive the event
 * 3. tRPC pushes the message to connected clients via WebSocket
 */

import { observable } from "@trpc/server/observable";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { EventEmitter } from "events";
import { protectedProcedure, router } from "../trpc.js";
import type { Context } from "../trpc.js";

// Type for message events
interface MessageEvent {
  id: string;
  content: string;
  createdAt: Date;
  threadId: string;
  sender: {
    id: string;
    username: string;
  };
}

// Global event emitter for message events
// In production, you'd use Redis pub/sub for multi-server support
const messageEmitter = new EventEmitter();

// Increase max listeners to handle many concurrent users
messageEmitter.setMaxListeners(100);

// =============================================================================
// SECURITY HELPERS (NEW)
// =============================================================================

/**
 * Authorization helper: Verify user is a participant in a thread
 *
 * This is the KEY security fix. Before allowing any operation on a thread,
 * we check that the authenticated user is actually a participant.
 *
 * @throws TRPCError with FORBIDDEN code if user is not a participant
 */
async function verifyThreadParticipant(
    ctx: Context & { user: NonNullable<Context["user"]> },
    threadId: string
): Promise<void> {
  const participant = await ctx.prisma.threadParticipant.findUnique({
    where: {
      // Uses the composite unique constraint: @@unique([userId, threadId])
      userId_threadId: {
        userId: ctx.user.userId,
        threadId: threadId,
      },
    },
  });

  if (!participant) {
    throw new TRPCError({
      code: "FORBIDDEN", // 403 - authenticated but not authorized
      message: "You are not a participant in this thread",
    });
  }
}

/**
 * Get all thread IDs the user participates in
 *
 * Used by onAnyNew subscription to filter messages.
 * Only messages from threads in this set will be forwarded to the user.
 */
async function getUserThreadIds(
    ctx: Context & { user: NonNullable<Context["user"]> }
): Promise<Set<string>> {
  const participations = await ctx.prisma.threadParticipant.findMany({
    where: { userId: ctx.user.userId },
    select: { threadId: true },
  });
  return new Set(participations.map((p) => p.threadId));
}

// =============================================================================
// ROUTER
// =============================================================================

export const messageRouter = router({
  /**
   * Send a message to a thread
   *
   * After saving, emits an event for real-time subscribers.
   *
   * SECURITY: Verifies user is a participant before allowing send
   */
  send: protectedProcedure
      .input(
          z.object({
            threadId: z.string(),
            content: z.string().min(1, "Message cannot be empty").max(5000),
          })
      )
      .mutation(async ({ input, ctx }) => {
        // =========================================
        // SECURITY CHECK (NEW - replaces old inline check)
        // =========================================
        await verifyThreadParticipant(ctx, input.threadId);

        // Create the message
        const message = await ctx.prisma.message.create({
          data: {
            content: input.content,
            threadId: input.threadId,
            senderId: ctx.user.userId,
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        });

        // Update thread's updatedAt for sorting
        await ctx.prisma.thread.update({
          where: { id: input.threadId },
          data: { updatedAt: new Date() },
        });

        // Emit event for real-time subscribers
        const messageEvent: MessageEvent = {
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
          threadId: message.threadId,
          sender: message.sender,
        };

        // Emit to thread-specific channel
        messageEmitter.emit(`thread:${input.threadId}`, messageEvent);

        // Also emit to a general channel for thread list updates
        messageEmitter.emit("message:new", messageEvent);

        return messageEvent;
      }),

  /**
   * Subscribe to new messages in a specific thread
   *
   * SECURITY FIX: Now verifies user is a participant BEFORE establishing
   * the WebSocket subscription. Without this check, any authenticated user
   * could subscribe to any thread and see all messages.
   *
   * HOW IT WORKS:
   * 1. Client calls trpc.message.onNew.subscribe({ threadId: "..." })
   * 2. Server verifies user is a participant (NEW - throws FORBIDDEN if not)
   * 3. Server keeps connection open
   * 4. When messageEmitter.emit() is called, this triggers
   * 5. Message is pushed to client via WebSocket
   */
  onNew: protectedProcedure
      .input(
          z.object({
            threadId: z.string(),
          })
      )
      .subscription(async ({ input, ctx }) => {
        // =========================================
        // SECURITY CHECK (NEW - this was completely missing before!)
        // This runs ONCE when subscription is established
        // =========================================
        await verifyThreadParticipant(ctx, input.threadId);

        // If we get here, user is authorized - create the subscription
        return observable<MessageEvent>((emit) => {
          // Handler for new messages
          const onMessage = (message: MessageEvent) => {
            // Only emit if message is for the subscribed thread
            if (message.threadId === input.threadId) {
              emit.next(message);
            }
          };

          // Subscribe to thread-specific events
          messageEmitter.on(`thread:${input.threadId}`, onMessage);

          console.log(
              `[WS] User ${ctx.user.username} subscribed to thread ${input.threadId}`
          );

          // Cleanup function - called when client disconnects
          return () => {
            messageEmitter.off(`thread:${input.threadId}`, onMessage);
            console.log(
                `[WS] User ${ctx.user.username} unsubscribed from thread ${input.threadId}`
            );
          };
        });
      }),

  /**
   * Subscribe to all new messages in threads the user participates in
   *
   * SECURITY FIX: Now only forwards messages from threads where the user
   * is a participant. Without this filter, ANY authenticated user would
   * receive ALL messages from ALL threads in the entire system.
   *
   * Used to update the "last message" preview in thread list
   * without subscribing to each thread individually.
   *
   * NOTE: Thread membership is checked at subscription time. If user is
   * added to a new thread, they need to re-subscribe to see those messages.
   */
  onAnyNew: protectedProcedure.subscription(async ({ ctx }) => {
    // =========================================
    // SECURITY: Get user's thread IDs for filtering (NEW)
    // This runs ONCE when subscription is established
    // =========================================
    const userThreadIds = await getUserThreadIds(ctx);

    return observable<MessageEvent>((emit) => {
      const onMessage = (message: MessageEvent) => {
        if (userThreadIds.has(message.threadId)) {
          emit.next(message);
        }
        // Messages from other threads are silently ignored
      };

      messageEmitter.on("message:new", onMessage);

      console.log(
          `[WS] User ${ctx.user.username} subscribed to their ${userThreadIds.size} threads`
      );

      return () => {
        messageEmitter.off("message:new", onMessage);
        console.log(
            `[WS] User ${ctx.user.username} unsubscribed from all messages`
        );
      };
    });
  }),
});