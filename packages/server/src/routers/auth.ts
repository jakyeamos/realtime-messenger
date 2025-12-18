/**
 * Auth Router
 * 
 * Handles user authentication.
 * 
 * PROCEDURES:
 * - login: Authenticate user and return JWT token
 * - me: Get current user info (protected)
 */

import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

// Input validation schema for login
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const authRouter = router({
  /**
   * Login procedure
   * 
   * Takes username/password, verifies credentials,
   * returns JWT token on success.
   */
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      const { username, password } = input;

      // Find user by username
      const user = await ctx.prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      // Create JWT token
      const secret = process.env.JWT_SECRET || "development-secret";
      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
        },
        secret,
        { expiresIn: "7d" }
      );

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
        },
      };
    }),

  /**
   * Get current user info
   * 
   * Returns the authenticated user's data.
   * Protected - requires valid JWT token.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return user;
  }),
});
