# Messenger App

A real-time messaging application demonstrating full-stack TypeScript development with end-to-end type safety.

## Demo Credentials

| Username | Password |
|----------|----------|
| alice | password123 |
| bob | password123 |
| charlie | password123 |

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | React 18, TypeScript, Tailwind | Industry standard, type safety, rapid styling |
| Backend | Node.js, Express, tRPC | E2E type safety without code generation |
| Database | PostgreSQL, Prisma ORM | Relational data model, type-safe queries |
| Real-time | WebSocket via tRPC subscriptions | Native integration, no additional libraries |

## Architecture Decisions

### Why tRPC over GraphQL?

- **No code generation** — Types inferred directly from backend code
- **Simpler setup** — No schema definition language required
- **Native subscriptions** — WebSocket support built-in
- **Perfect for this scope** — GraphQL shines with multiple clients; we have one

### Why Prisma?

- **Type-safe queries** — `prisma.user.findMany()` returns typed `User[]`
- **Migration management** — Schema changes tracked in version control
- **Developer experience** — Intuitive API, excellent documentation

### Database Schema
```
User ←→ ThreadParticipant ←→ Thread ←→ Message
```

- Many-to-many between Users and Threads via join table
- Supports future expansion to group chats (3+ participants)
- Messages indexed by `[threadId, createdAt]` for efficient retrieval

### Real-Time Implementation
```
Client A sends message
    → Server saves to DB
    → Server emits to EventEmitter
    → All subscribed clients receive via WebSocket
    → UI updates instantly
```

**Production consideration:** Current implementation uses in-memory EventEmitter, suitable for single-server deployment. For horizontal scaling, would replace with Redis pub/sub.

## Project Structure
```
messenger-app/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── routers/       # tRPC API endpoints
│   │   │   │   ├── auth.ts    # Login, session management
│   │   │   │   ├── thread.ts  # Thread CRUD operations
│   │   │   │   └── message.ts # Messaging + real-time subscriptions
│   │   │   ├── db.ts          # Prisma client singleton
│   │   │   ├── trpc.ts        # tRPC config, auth middleware
│   │   │   └── index.ts       # Express + WebSocket server
│   │   └── prisma/
│   │       ├── schema.prisma  # Database schema
│   │       └── seed.ts        # Test data
│   │
│   └── client/
│       └── src/
│           ├── components/    # React components
│           ├── pages/         # Route pages
│           ├── utils/         # Shared utilities
│           └── types/         # TypeScript definitions
│
└── docker-compose.yml         # PostgreSQL container
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Docker (for PostgreSQL)

### Setup
```bash
# Install dependencies
npm install

# Start PostgreSQL
docker-compose up -d

# Configure environment
cp packages/server/.env.example packages/server/.env

# Setup database
npm run db:generate
npm run db:migrate
npm run db:seed

# Start development servers
npm run dev
```

Open http://localhost:5173

### Testing
```bash
cd packages/client
npm test
```

## Key Features

### End-to-End Type Safety

Change a field on the backend → TypeScript errors appear on frontend immediately. No runtime type mismatches.

### Real-Time Messaging

Messages appear instantly across all connected clients via WebSocket subscriptions. No polling.

### Send Confirmation

Visual checkmark confirms message delivery.

### Clean Code Patterns

- Centralized utilities for formatting and validation
- Consistent component structure
- Fail-fast input validation on client and server

## Future Improvements

With more time, would add:

- [ ] Read receipts
- [ ] Typing indicators
- [ ] Online/offline status
- [ ] Message search
- [ ] File attachments
- [ ] E2E encryption

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend and backend |
| `npm run dev:server` | Backend only (port 3000) |
| `npm run dev:client` | Frontend only (port 5173) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed test users |
| `npm run db:studio` | Open Prisma GUI |