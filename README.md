# Real-Time Messenger

A real-time messaging application demonstrating full-stack TypeScript development with end-to-end type safety, secure WebSocket subscriptions, and production-ready patterns.

---

## Demo Credentials

| Username | Password     |
|----------|--------------|
| alice    | password123  |
| bob      | password123  |
| charlie  | password123  |

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18, TypeScript, Tailwind    |
| Backend   | Node.js, Express, tRPC            |
| Database  | PostgreSQL, Prisma ORM            |
| Real-time | WebSocket via tRPC subscriptions  |
| Auth      | JWT with bcrypt                   |

---

## Key Features

- **Real-time messaging** — Messages appear instantly via WebSocket subscriptions
- **End-to-end type safety** — Change a field on backend → TypeScript errors on frontend immediately
- **Optimistic updates** — Messages show instantly while sending, with retry on failure
- **Connection resilience** — Auto-reconnect with exponential backoff on WebSocket disconnect
- **Unread indicators** — Track last read timestamp per user per thread
- **Message grouping** — Consecutive messages from same sender grouped visually

---

## Architecture Decisions

### Database Schema

```
User ←→ ThreadParticipant ←→ Thread ←→ Message
         (join table)
```

```prisma
model ThreadParticipant {
  userId     String
  threadId   String
  lastReadAt DateTime
  
  @@unique([userId, threadId])
}
```

- Many-to-many via explicit join table for `lastReadAt` metadata
- `@@index([threadId, createdAt])` on messages for efficient retrieval
- Supports future group chats without schema changes

### Real-Time Implementation

```
┌────────────┐     HTTP POST      ┌────────────┐
│  Client A  │ ─────────────────→ │   Server   │
│  (sender)  │                    │            │
└────────────┘                    │  1. Save   │
                                  │  2. Emit   │
┌────────────┐     WebSocket      │            │
│  Client B  │ ←───────────────── │            │
│ (receiver) │                    └────────────┘
└────────────┘
```

1. Client sends message via HTTP mutation
2. Server saves to PostgreSQL
3. Server emits to EventEmitter
4. Subscribed clients receive via WebSocket

**Scaling consideration:** Current EventEmitter is single-server. For horizontal scaling, replace with Redis pub/sub.

---

## Security Implementation

### Authentication vs Authorization

| Layer           | Question                        | Implementation                     |
|-----------------|---------------------------------|------------------------------------|
| Authentication  | "Who are you?"                  | JWT verification in tRPC context   |
| Authorization   | "Can you access this resource?" | `verifyThreadParticipant()` check  |

### Protected Subscriptions

WebSocket subscriptions verify participant membership before establishing connection:

```typescript
onNew: protectedProcedure
  .subscription(async ({ input, ctx }) => {
    await verifyThreadParticipant(ctx, input.threadId);
    return observable((emit) => { ... });
  });
```

The `onAnyNew` subscription filters messages server-side so users only receive messages from their own threads.

### Password Security

- Passwords hashed with bcrypt (cost factor 10)
- JWT tokens expire after 7 days
- Tokens passed via Authorization header (HTTP) and query param (WebSocket)

---

## Error Handling & Resilience

### WebSocket Reconnection

```typescript
retryDelayMs: (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000)
```

- Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s max
- Jitter added to prevent thundering herd
- Connection state exposed to UI for user feedback
- Max 10 reconnection attempts

### Optimistic Updates

```
User clicks send
    ↓
Show message immediately (status: "sending")
    ↓
HTTP request to server
    ↓
On success: Replace optimistic with server message
On failure: Show "Failed" with Retry/Delete options
```

---

## Quick Start

### Prerequisites

- Node.js 18+
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

---

## Production Considerations

| Area              | Implementation                                           |
|-------------------|----------------------------------------------------------|
| **Scaling**       | Redis pub/sub for multi-server WebSocket broadcasts      |
| **Monitoring**    | Structured logging (Pino), APM (DataDog), error tracking (Sentry) |
| **Security**      | Rate limiting, CSRF protection, audit logging            |
| **Performance**   | Message pagination, Redis caching for unread counts      |
| **Reliability**   | Health check endpoints, graceful shutdown, connection pooling |

---

## Future Improvements

- [ ] Integration tests for critical paths
- [ ] Rate limiting on message sends
- [ ] Message pagination for large threads
- [ ] Read receipts
- [ ] Typing indicators
- [ ] Online/offline presence
- [ ] Message search
- [ ] File attachments
- [ ] E2E encryption