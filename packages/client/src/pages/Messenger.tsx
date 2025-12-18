/**
 * Messenger Page
 * 
 * Main chat interface with:
 * - Thread list on the left
 * - Chat view on the right
 * - Option to create new threads
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc, auth } from "../utils/trpc";
import ThreadList from "../components/ThreadList";
import ChatView from "../components/ChatView";
import NewThreadModal from "../components/NewThreadModal";

export default function Messenger() {
  const navigate = useNavigate();
  
  // Currently selected thread
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  
  // New thread modal state
  const [isNewThreadModalOpen, setIsNewThreadModalOpen] = useState(false);

  // Get current user info
  const { data: user } = trpc.auth.me.useQuery();

  const handleLogout = () => {
    auth.clearToken();
    navigate("/login");
  };

  const handleThreadCreated = (threadId: string) => {
    setSelectedThreadId(threadId);
    setIsNewThreadModalOpen(false);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Messenger</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-600">
            Logged in as <strong>{user?.username}</strong>
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread list sidebar */}
        <aside className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <button
              onClick={() => setIsNewThreadModalOpen(true)}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              New Message
            </button>
          </div>
          <ThreadList
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
          />
        </aside>

        {/* Chat view */}
        <main className="flex-1 flex flex-col bg-gray-50">
          {selectedThreadId ? (
            <ChatView threadId={selectedThreadId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a conversation or start a new one
            </div>
          )}
        </main>
      </div>

      {/* New thread modal */}
      <NewThreadModal
        isOpen={isNewThreadModalOpen}
        onClose={() => setIsNewThreadModalOpen(false)}
        onThreadCreated={handleThreadCreated}
      />
    </div>
  );
}
