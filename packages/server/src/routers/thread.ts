/**
 * Thread Router
 * 
 * Handles conversation threads between users.
 * 
 * PROCEDURES:
 * - list: Get all threads for current user
 * - create: Start a new thread with another user
 * - getById: Get a specific thread with messages
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const threadRouter = router({
  /**
   * List all threads for the current user
   * 
   * Returns threads with:
   * - Other participants' info
   * - Last message preview
   * - Sorted by most recent activity
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const threads = await ctx.prisma.thread.findMany({
      where: {
        participants: {
          some: {
            userId: ctx.user.userId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return threads.map((thread) => {
      // Find current user's participant record to get lastReadAt
      const currentUserParticipant = thread.participants.find(
          (p) => p.userId === ctx.user.userId
      );
      const lastReadAt = currentUserParticipant?.lastReadAt ?? new Date(0);
      const lastMessage = thread.messages[0];

      // Thread has unread if last message exists and is after lastReadAt
      const hasUnread = lastMessage
          ? new Date(lastMessage.createdAt) > new Date(lastReadAt)
          : false;

      return {
        id: thread.id,
        updatedAt: thread.updatedAt,
        participants: thread.participants
            .filter((p) => p.userId !== ctx.user.userId)
            .map((p) => p.user),
        lastMessage: lastMessage || null,
        hasUnread,
      };
    });
  }),

  /**
   * Create a new thread with another user
   * 
   * If a thread already exists between these users, returns that instead.
   */
  create: protectedProcedure
    .input(
      z.object({
        username: z.string().min(1, "Username is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Can't create a thread with yourself
      if (input.username === ctx.user.username) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot create a thread with yourself",
        });
      }

      // Find the target user
      const targetUser = await ctx.prisma.user.findUnique({
        where: { username: input.username },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User "${input.username}" not found`,
        });
      }

      // Check if a thread already exists between these users
      const existingThread = await ctx.prisma.thread.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: ctx.user.userId } } },
            { participants: { some: { userId: targetUser.id } } },
          ],
          // Only match threads with exactly 2 participants (DMs)
          participants: {
            every: {
              userId: { in: [ctx.user.userId, targetUser.id] },
            },
          },
        },
      });

      if (existingThread) {
        return { id: existingThread.id, alreadyExists: true };
      }

      // Create new thread with both participants
      const thread = await ctx.prisma.thread.create({
        data: {
          participants: {
            create: [
              { userId: ctx.user.userId },
              { userId: targetUser.id },
            ],
          },
        },
      });

      return { id: thread.id, alreadyExists: false };
    }),

  /**
   * Get a thread by ID with all messages
   * 
   * Verifies the current user is a participant.
   */
  getById: protectedProcedure
      .input(
          z.object({
            threadId: z.string(),
          })
      )
      .query(async ({ input, ctx }) => {
        const thread = await ctx.prisma.thread.findFirst({
          where: {
            id: input.threadId,
            // Ensure current user is a participant
            participants: {
              some: {
                userId: ctx.user.userId,
              },
            },
          },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
            messages: {
              orderBy: {
                createdAt: "asc", // Oldest first
              },
              include: {
                sender: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
          },
        });

        if (!thread) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Thread not found",
          });
        }

        return {
          id: thread.id,
          participants: thread.participants.map((p) => p.user),
          messages: thread.messages.map((m) => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt,
            sender: m.sender,
          })),
        };
      }),

  markAsRead: protectedProcedure
      .input(
          z.object({
            threadId: z.string(),
          })
      )
      .mutation(async ({ input, ctx }) => {
        await ctx.prisma.threadParticipant.updateMany({
          where: {
            threadId: input.threadId,
            userId: ctx.user.userId,
          },
          data: {
            lastReadAt: new Date(),
          },
        });

        return { success: true };
      }),
});
