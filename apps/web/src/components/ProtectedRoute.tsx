import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@layk/core';

interface ProtectedRouteProps {
  allowedRole?: 'admin' | 'user';
}

export default function ProtectedRoute({ allowedRole }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && profile.role !== allowedRole) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return <Outlet />;
}
