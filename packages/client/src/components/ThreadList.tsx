import { trpc } from "../utils/trpc";
import { formatRelativeTime } from "../utils/format";
import Avatar from "./Avatar";


interface ThreadListProps {
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export default function ThreadList({
                                     selectedThreadId,
                                     onSelectThread,
                                   }: ThreadListProps) {
  // Queries
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: threads, isLoading } = trpc.thread.list.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Cache utils
  const utils = trpc.useUtils();

  // Subscriptions
  trpc.message.onAnyNew.useSubscription(undefined, {
    onData: () => {
      void utils.thread.list.invalidate();
    },
  });

  // Loading state
  if (isLoading) {
    return (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Loading...
        </div>
    );
  }

  // Empty state
  if (!threads?.length) {
    return (
        <div className="flex-1 flex items-center justify-center text-gray-500 px-4 text-center">
          No conversations yet. Start a new message!
        </div>
    );
  }

  return (
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const isSelected = thread.id === selectedThreadId;
          const otherUser = thread.participants[0];
          const lastMessage = thread.lastMessage;

            return (
                <button
                    key={thread.id}
                    onClick={() => onSelectThread(thread.id)}
                    className={`w-full p-4 text-left border-b hover:bg-gray-50 transition-colors ${
                        isSelected ? "bg-blue-50" : ""
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Avatar username={otherUser?.username || "?"} />
                            {thread.hasUnread && (
                                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">
                                {otherUser?.username || "Unknown"}
                            </div>

                            {lastMessage && (
                                <div className={`text-sm truncate ${thread.hasUnread ? "text-gray-900 font-medium" : "text-gray-500"}`}>
            <span className="font-medium">
              {lastMessage.sender.id === currentUser?.id
                  ? "me"
                  : lastMessage.sender.username}
                :
            </span>{" "}
                                    {lastMessage.content}
                                </div>
                            )}
                        </div>

                        <div className="text-xs text-gray-400">
                            {formatRelativeTime(thread.updatedAt)}
                        </div>
                    </div>
                </button>
            );
        })}
      </div>
  );
}