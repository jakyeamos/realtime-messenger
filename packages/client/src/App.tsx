/**
 * Main App Component
 * 
 * Sets up routing between Login and Messenger pages.
 * Handles auth state to redirect appropriately.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import { auth } from "./utils/trpc";
import Login from "./pages/Login";
import Messenger from "./pages/Messenger";

/**
 * Protected Route wrapper
 * Redirects to login if not authenticated
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * Public Route wrapper
 * Redirects to messenger if already authenticated
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  if (auth.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Messenger />
          </ProtectedRoute>
        }
      />
      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
