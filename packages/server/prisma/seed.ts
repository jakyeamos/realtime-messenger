/**
 * Database Seed Script
 * 
 * Creates test users for development and demo purposes.
 * Run with: pnpm db:seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Hash password - same for all test users for simplicity
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create test users
  const users = await Promise.all([
    prisma.user.upsert({
      where: { username: "alice" },
      update: {},
      create: {
        username: "alice",
        password: hashedPassword,
      },
    }),
    prisma.user.upsert({
      where: { username: "bob" },
      update: {},
      create: {
        username: "bob",
        password: hashedPassword,
      },
    }),
    prisma.user.upsert({
      where: { username: "charlie" },
      update: {},
      create: {
        username: "charlie",
        password: hashedPassword,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users:`);
  users.forEach((user) => {
    console.log(`   - ${user.username} (password: password123)`);
  });

  // Create a sample thread between alice and bob
  const existingThread = await prisma.thread.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: users[0].id } } },
        { participants: { some: { userId: users[1].id } } },
      ],
    },
  });

  if (!existingThread) {
    const thread = await prisma.thread.create({
      data: {
        participants: {
          create: [
            { userId: users[0].id }, // alice
            { userId: users[1].id }, // bob
          ],
        },
        messages: {
          create: [
            {
              content: "Hey Bob! How are you?",
              senderId: users[0].id,
            },
            {
              content: "Hi Alice! I'm doing great, thanks for asking!",
              senderId: users[1].id,
            },
            {
              content: "Want to grab coffee later?",
              senderId: users[0].id,
            },
          ],
        },
      },
    });
    console.log(`✅ Created sample thread with 3 messages`);
  } else {
    console.log(`ℹ️  Sample thread already exists`);
  }

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
