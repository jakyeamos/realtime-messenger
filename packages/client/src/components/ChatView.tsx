/**
 * Chat View Component
 *
 * Displays messages in a thread with real-time updates.
 *
 * FEATURES:
 * - Optimistic message sending (instant UI feedback)
 * - Real-time updates via WebSocket
 * - Connection state awareness
 * - Error handling with retry capability
 * - Auto-scroll to bottom
 *
 * REAL-TIME FLOW:
 * 1. Initial messages loaded via query
 * 2. Subscribe to new messages via WebSocket
 * 3. When user sends: show optimistic message immediately
 * 4. On server confirm: replace optimistic with real message
 * 5. On error: show retry option
 */

import { useState, useRef, useEffect, FormEvent, useCallback } from "react";
import { trpc, connectionManager, getErrorMessage, isNetworkError } from "../utils/trpc";
import { formatMessageTime } from "../utils/format.ts";
import { validateMessage } from "../utils/validation";
import { Message } from "../types";

interface ChatViewProps {
  threadId: string;
}

// Optimistic message type (has temporary ID, pending state)
interface OptimisticMessage extends Omit<Message, "id"> {
  id: string;
  optimisticId: string;
  status: "sending" | "sent" | "failed";
  error?: string;
}

type DisplayMessage = Message | OptimisticMessage;

function isOptimisticMessage(msg: DisplayMessage): msg is OptimisticMessage {
  return "status" in msg;
}

export default function ChatView({ threadId }: ChatViewProps) {
  // Message input state
  const [newMessage, setNewMessage] = useState("");

  // Connection state for UI feedback
  const [connectionState, setConnectionState] = useState(connectionManager.getState());

  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Local messages state (combines query data + subscription updates + optimistic)
  const [localMessages, setLocalMessages] = useState<DisplayMessage[]>([]);

  // Track optimistic messages by their temp ID
  const [optimisticMessages, setOptimisticMessages] = useState<Map<string, OptimisticMessage>>(
      new Map()
  );

  const utils = trpc.useUtils();

  // Get current user
  const { data: currentUser } = trpc.auth.me.useQuery();

  // Subscribe to connection state changes
  useEffect(() => {
    return connectionManager.subscribe(setConnectionState);
  }, []);

  const markAsReadMutation = trpc.thread.markAsRead.useMutation({
    onSuccess: () => {
      void utils.thread.list.invalidate();
    },
  });

  // Fetch thread with messages
  const { data: thread, isLoading, error: fetchError, refetch } = trpc.thread.getById.useQuery(
      { threadId },
      {
        onSuccess: (data) => {
          // Initialize local messages with fetched data
          setLocalMessages(data.messages);
        },
        retry: 2,
        retryDelay: 1000,
      }
  );

  // Reset local messages when thread changes
  useEffect(() => {
    setLocalMessages([]);
    setOptimisticMessages(new Map());
  }, [threadId]);

  // Generate unique optimistic ID
  const generateOptimisticId = useCallback(() => {
    return `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Send message mutation with optimistic update handling
  const sendMutation = trpc.message.send.useMutation({
    onSuccess: (serverMessage, variables) => {
      // Find and remove the optimistic message, replace with server message
      setOptimisticMessages((prev) => {
        const newMap = new Map(prev);
        for (const [id, msg] of newMap) {
          if (msg.content === variables.content && msg.status === "sending") {
            newMap.delete(id);
            break;
          }
        }
        return newMap;
      });

      // Add the confirmed message
      setLocalMessages((prev) => {
        const filtered = prev.filter(
            (m) => !isOptimisticMessage(m) || m.content !== variables.content
        );
        if (filtered.some((m) => m.id === serverMessage.id)) {
          return filtered;
        }
        return [...filtered, serverMessage];
      });

      setNewMessage("");
    },

    onError: (error, variables) => {
      // Mark optimistic message as failed
      setOptimisticMessages((prev) => {
        const newMap = new Map(prev);
        for (const [id, msg] of newMap) {
          if (msg.content === variables.content && msg.status === "sending") {
            newMap.set(id, {
              ...msg,
              status: "failed",
              error: getErrorMessage(error),
            });
            break;
          }
        }
        return newMap;
      });

      setLocalMessages((prev) =>
          prev.map((m) => {
            if (isOptimisticMessage(m) && m.content === variables.content && m.status === "sending") {
              return { ...m, status: "failed", error: getErrorMessage(error) };
            }
            return m;
          })
      );
    },
  });

  /**
   * Retry sending a failed message
   */
  const retryMessage = useCallback(
      (optimisticId: string) => {
        const msg = optimisticMessages.get(optimisticId);
        if (!msg) return;

        setOptimisticMessages((prev) => {
          const newMap = new Map(prev);
          newMap.set(optimisticId, { ...msg, status: "sending", error: undefined });
          return newMap;
        });

        setLocalMessages((prev) =>
            prev.map((m) =>
                isOptimisticMessage(m) && m.optimisticId === optimisticId
                    ? { ...m, status: "sending", error: undefined }
                    : m
            )
        );

        sendMutation.mutate({
          threadId,
          content: msg.content,
        });
      },
      [optimisticMessages, sendMutation, threadId]
  );

  /**
   * Remove a failed message
   */
  const removeFailedMessage = useCallback((optimisticId: string) => {
    setOptimisticMessages((prev) => {
      const newMap = new Map(prev);
      newMap.delete(optimisticId);
      return newMap;
    });

    setLocalMessages((prev) =>
        prev.filter((m) => !isOptimisticMessage(m) || m.optimisticId !== optimisticId)
    );
  }, []);

  // Mark thread as read when viewed
  useEffect(() => {
    if (threadId) {
      markAsReadMutation.mutate({ threadId });
    }
  }, [threadId]);

  /**
   * Subscribe to new messages (WebSocket)
   */
  trpc.message.onNew.useSubscription(
      { threadId },
      {
        enabled: connectionState === "connected" || connectionState === "reconnecting",
        onData: (message) => {
          setLocalMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) {
              return prev;
            }
            const matchingOptimistic = prev.find(
                (m) =>
                    isOptimisticMessage(m) &&
                    m.sender.id === message.sender.id &&
                    m.content === message.content
            );
            if (matchingOptimistic && isOptimisticMessage(matchingOptimistic)) {
              return [...prev.filter((m) => m !== matchingOptimistic), message];
            }
            return [...prev, message];
          });
        },
        onError: (err) => {
          console.error("[Subscription] Error:", err);
        },
      }
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();

    const error = validateMessage(newMessage);
    if (error) return;

    const content = newMessage.trim();
    if (!content || !currentUser) return;

    const optimisticId = generateOptimisticId();
    const optimisticMsg: OptimisticMessage = {
      id: optimisticId,
      optimisticId,
      content,
      createdAt: new Date(),
      threadId,
      sender: {
        id: currentUser.id,
        username: currentUser.username,
      },
      status: "sending",
    };

    setOptimisticMessages((prev) => new Map(prev).set(optimisticId, optimisticMsg));
    setLocalMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");

    sendMutation.mutate({ threadId, content });
  };

  if (isLoading) {
    return (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span>Loading messages...</span>
          </div>
        </div>
    );
  }

  if (fetchError) {
    return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{getErrorMessage(fetchError)}</p>
            <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
    );
  }

  if (!thread) {
    return (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Thread not found
        </div>
    );
  }

  const otherUser = thread.participants.find((p) => p.id !== currentUser?.id);

  return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Chat header */}
        <header className="px-4 py-3 bg-white border-b">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{otherUser?.username || "Chat"}</h2>

            {connectionState !== "connected" && (
                <div className="flex items-center gap-2 text-sm">
                  {connectionState === "connecting" && (
                      <span className="text-yellow-600">Connecting...</span>
                  )}
                  {connectionState === "reconnecting" && (
                      <span className="text-yellow-600 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-600"></div>
                  Reconnecting...
                </span>
                  )}
                  {connectionState === "disconnected" && (
                      <span className="text-red-600">Disconnected</span>
                  )}
                </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {localMessages.map((message, index) => {
            const isOwnMessage = message.sender.id === currentUser?.id;
            const prevMessage = localMessages[index - 1];
            const nextMessage = localMessages[index + 1];
            const isOptimistic = isOptimisticMessage(message);

            const GROUP_TIME_THRESHOLD = 4 * 60 * 1000;

            const timeSincePrev = prevMessage
                ? new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime()
                : Infinity;
            const timeToNext = nextMessage
                ? new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime()
                : Infinity;

            const isFirstInGroup =
                !prevMessage ||
                prevMessage.sender.id !== message.sender.id ||
                timeSincePrev > GROUP_TIME_THRESHOLD;
            const isLastInGroup =
                !nextMessage ||
                nextMessage.sender.id !== message.sender.id ||
                timeToNext > GROUP_TIME_THRESHOLD;

            return (
                <div
                    key={message.id}
                    className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} ${
                        isFirstInGroup && index !== 0 ? "mt-3" : "mt-1"
                    }`}
                >
                  <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 ${
                          isOwnMessage
                              ? isOptimistic && message.status === "failed"
                                  ? "bg-red-100 text-red-900 border border-red-300"
                                  : "bg-blue-600 text-white"
                              : "bg-white text-gray-900 border"
                      } ${
                          isOwnMessage
                              ? `${isFirstInGroup ? "rounded-t-lg" : "rounded-t-md"} ${
                                  isLastInGroup ? "rounded-b-lg rounded-bl-lg" : "rounded-b-md"
                              } rounded-l-lg`
                              : `${isFirstInGroup ? "rounded-t-lg" : "rounded-t-md"} ${
                                  isLastInGroup ? "rounded-b-lg rounded-br-lg" : "rounded-b-md"
                              } rounded-r-lg`
                      } ${isOptimistic && message.status === "sending" ? "opacity-70" : ""}`}
                  >
                    <div className="break-words">{message.content}</div>

                    {isLastInGroup && (
                        <div
                            className={`text-xs mt-1 flex items-center gap-1 ${
                                isOwnMessage
                                    ? isOptimistic && message.status === "failed"
                                        ? "text-red-600"
                                        : "text-blue-200"
                                    : "text-gray-400"
                            }`}
                        >
                          {formatMessageTime(message.createdAt)}

                          {isOwnMessage && isOptimistic && message.status === "sending" && (
                              <span className="animate-pulse" title="Sending...">○</span>
                          )}
                          {isOwnMessage && isOptimistic && message.status === "failed" && (
                              <span title="Failed to send">✕</span>
                          )}
                          {isOwnMessage && !isOptimistic && <span title="Sent">✓</span>}
                        </div>
                    )}

                    {isOptimistic && message.status === "failed" && (
                        <div className="mt-2 flex gap-2 text-xs">
                          <button
                              onClick={() => retryMessage(message.optimisticId)}
                              className="text-blue-600 hover:underline"
                          >
                            Retry
                          </button>
                          <button
                              onClick={() => removeFailedMessage(message.optimisticId)}
                              className="text-gray-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                    )}
                  </div>
                </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <form onSubmit={handleSend} className="p-4 bg-white border-t shadow-sm">
          {connectionState === "disconnected" && (
              <div className="mb-2 text-sm text-red-600 text-center">
                Connection lost. Messages may not be delivered.
              </div>
          )}

          <div className="flex items-center gap-3">
            <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  connectionState === "disconnected" ? "Reconnecting..." : "Type a message..."
                }
                className="flex-1 px-4 py-3 bg-gray-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                disabled={connectionState === "disconnected"}
            />
            <button
                type="submit"
                disabled={!newMessage.trim() || connectionState === "disconnected"}
                className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
  );
}