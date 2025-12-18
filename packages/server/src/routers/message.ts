/**
 * Message Router
 * 
 * Handles sending messages and real-time updates.
 * 
 * PROCEDURES:
 * - send: Send a message to a thread
 * - onNew: Subscribe to new messages (WebSocket)
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

export const messageRouter = router({
  /**
   * Send a message to a thread
   * 
   * After saving, emits an event for real-time subscribers.
   */
  send: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        content: z.string().min(1, "Message cannot be empty").max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user is a participant in this thread
      const thread = await ctx.prisma.thread.findFirst({
        where: {
          id: input.threadId,
          participants: {
            some: {
              userId: ctx.user.userId,
            },
          },
        },
      });

      if (!thread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found or you are not a participant",
        });
      }

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
   * This creates a WebSocket subscription that pushes
   * messages to the client in real-time.
   * 
   * HOW IT WORKS:
   * 1. Client calls trpc.message.onNew.subscribe({ threadId: "..." })
   * 2. Server keeps connection open
   * 3. When messageEmitter.emit() is called, this triggers
   * 4. Message is pushed to client via WebSocket
   */
  onNew: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
      })
    )
    .subscription(({ input, ctx }) => {
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
   * Subscribe to all new messages (for updating thread list)
   * 
   * Used to update the "last message" preview in thread list
   * without subscribing to each thread individually.
   */
  onAnyNew: protectedProcedure.subscription(({ ctx }) => {
    return observable<MessageEvent>((emit) => {
      const onMessage = (message: MessageEvent) => {
        emit.next(message);
      };

      messageEmitter.on("message:new", onMessage);

      console.log(`[WS] User ${ctx.user.username} subscribed to all messages`);

      return () => {
        messageEmitter.off("message:new", onMessage);
        console.log(
          `[WS] User ${ctx.user.username} unsubscribed from all messages`
        );
      };
    });
  }),
});
