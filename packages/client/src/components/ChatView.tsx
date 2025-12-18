/**
 * Chat View Component
 * 
 * Displays messages in a thread with real-time updates.
 * 
 * REAL-TIME FLOW:
 * 1. Initial messages loaded via query
 * 2. Subscribe to new messages via WebSocket
 * 3. When subscription receives message, add to local state
 * 4. Auto-scroll to bottom on new messages
 */

import { useState, useRef, useEffect, FormEvent } from "react";
import { trpc } from "../utils/trpc";
import {formatMessageTime} from "../utils/format.ts";
import { validateMessage } from "../utils/validation";
import { Message } from "../types";

interface ChatViewProps {
  threadId: string;
}

export default function ChatView({ threadId }: ChatViewProps) {
  // Message input state
  const [newMessage, setNewMessage] = useState("");
  
  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Local messages state (combines query data + subscription updates)
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  const markAsReadMutation = trpc.thread.markAsRead.useMutation({
    onSuccess: () => {
      void utils.thread.list.invalidate();
    },
  });

  const utils = trpc.useUtils();
  // Get current user
  const { data: currentUser } = trpc.auth.me.useQuery();

  // Track messages that are currently being sent

  // Fetch thread with messages
  const { data: thread, isLoading } = trpc.thread.getById.useQuery(
    { threadId },
    {
      onSuccess: (data) => {
        // Initialize local messages with fetched data
        setLocalMessages(data.messages);
      },
    }
  );

  // Reset local messages when thread changes
  useEffect(() => {
    setLocalMessages([]);
  }, [threadId]);

  // Send message mutation
  const sendMutation = trpc.message.send.useMutation({
    onSuccess: () => {
      setNewMessage("");
    },
  });

  // Mark thread as read when viewed
  useEffect(() => {
    if (threadId) {
      markAsReadMutation.mutate({ threadId });
    }
  }, [threadId]);

  /**
   * Subscribe to new messages (WebSocket)
   * 
   * This is the real-time magic!
   * When someone sends a message, the server emits an event,
   * and this subscription receives it immediately.
   */
  trpc.message.onNew.useSubscription(
    { threadId },
    {
      onData: (message) => {
        // Add new message to local state
        setLocalMessages((prev) => {
          // Prevent duplicates (in case we sent the message ourselves)
          if (prev.some((m) => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
      },
      onError: (err) => {
        console.error("Subscription error:", err);
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
    if (error) {
      return; // Could show error to user, but empty messages just won't send
    }

    sendMutation.mutate({
      threadId,
      content: newMessage.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Loading messages...
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

  // Get other participant for header
  const otherUser = thread.participants.find(
    (p) => p.id !== currentUser?.id
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Chat header */}
      <header className="px-4 py-3 bg-white border-b">
        <h2 className="font-semibold">{otherUser?.username || "Chat"}</h2>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {localMessages.map((message, index) => {
          const isOwnMessage = message.sender.id === currentUser?.id;
          const prevMessage = localMessages[index - 1];
          const nextMessage = localMessages[index + 1];

          // Time threshold for grouping (4 minutes)
          const GROUP_TIME_THRESHOLD = 4 * 60 * 1000;

          // Check time differences
          const timeSincePrev = prevMessage
              ? new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime()
              : Infinity;
          const timeToNext = nextMessage
              ? new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime()
              : Infinity;

          // Check if this message is part of a group (same sender AND within time threshold)
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
                  className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} ${isFirstInGroup && index !== 0 ? "mt-3" : "mt-1"}`}
              >
                <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 ${
                        isOwnMessage
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-900 border"
                    } ${
                        isOwnMessage
                            ? `${isFirstInGroup ? "rounded-t-lg" : "rounded-t-md"} ${isLastInGroup ? "rounded-b-lg rounded-bl-lg" : "rounded-b-md"} rounded-l-lg`
                            : `${isFirstInGroup ? "rounded-t-lg" : "rounded-t-md"} ${isLastInGroup ? "rounded-b-lg rounded-br-lg" : "rounded-b-md"} rounded-r-lg`
                    }`}
                >
                  <div className="break-words">{message.content}</div>

                  {isLastInGroup && (
                      <div
                          className={`text-xs mt-1 flex items-center gap-1 ${
                              isOwnMessage ? "text-blue-200" : "text-gray-400"
                          }`}
                      >
                        {formatMessageTime(message.createdAt)}
                        {isOwnMessage && <span title="Sent">✓</span>}
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
        <div className="flex items-center gap-3">
          <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 bg-gray-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
          <button
              type="submit"
              disabled={!newMessage.trim() || sendMutation.isLoading}
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
};
