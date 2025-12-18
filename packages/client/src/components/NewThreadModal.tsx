import { useState, useEffect, useRef, FormEvent } from "react";
import { trpc } from "../utils/trpc";

interface NewThreadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onThreadCreated: (threadId: string) => void;
}

export default function NewThreadModal({
                                         isOpen,
                                         onClose,
                                         onThreadCreated,
                                       }: NewThreadModalProps) {
  // State
  const [username, setUsername] = useState("");

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);

  // Cache utils
  const utils = trpc.useUtils();

  // Mutations
  const createMutation = trpc.thread.create.useMutation({
    onSuccess: (data) => {
      void utils.thread.list.invalidate();
      onThreadCreated(data.id);
    },
  });

  // Effects
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setUsername("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Handlers
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    createMutation.mutate({ username: username.trim() });
  };

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={onClose}
        />

        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 className="text-xl font-semibold mb-4">New Message</h2>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700 mb-1"
              >
                Username
              </label>
              <input
                  ref={inputRef}
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username to message"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {createMutation.error && (
                <div className="mb-4 text-sm text-red-500">
                  {createMutation.error.message}
                </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                  type="submit"
                  disabled={!username.trim() || createMutation.isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                {createMutation.isLoading ? "Creating..." : "Start Chat"}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}