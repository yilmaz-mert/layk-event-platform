import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@layk/core';

export default function PublicRoute() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Guests and regular users (any approval_status) may browse. Admins are
  // always sent to /admin — preserves the previous behavior where
  // ProtectedRoute allowedRole="user" bounced admins off these routes.
  if (session && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
