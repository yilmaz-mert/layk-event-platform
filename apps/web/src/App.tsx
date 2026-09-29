import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@layk/core';
import { ToastProvider } from '@/components/Toast';
import ProtectedRoute from '@/components/ProtectedRoute';
import PublicRoute from '@/components/PublicRoute';
import UserLayout from '@/components/UserLayout';
import AdminLayout from '@/components/AdminLayout';
import Login from '@/pages/Login';
import UserFeed from '@/pages/UserFeed';
import MyBookings from '@/pages/MyBookings';
import UserProfile from '@/pages/UserProfile';
import EventDetails from '@/pages/EventDetails';
// Admin pages load on demand so regular users never download them. The Suspense
// boundary lives in AdminLayout, so the admin header stays put while a chunk loads.
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const AdminEvents = lazy(() => import('@/pages/AdminEvents'));
const AdminEventDetails = lazy(() => import('@/pages/AdminEventDetails'));
const AdminBroadcast = lazy(() => import('@/pages/AdminBroadcast'));
const AdminTickets = lazy(() => import('@/pages/AdminTickets'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<UserLayout />}>
              <Route element={<PublicRoute />}>
                <Route path="/" element={<UserFeed />} />
                <Route path="/events/:id" element={<EventDetails />} />
              </Route>

              <Route element={<ProtectedRoute allowedRole="user" />}>
                <Route path="/my-bookings" element={<MyBookings />} />
                <Route path="/profile" element={<UserProfile />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute allowedRole="admin" />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/events" element={<AdminEvents />} />
                <Route path="/admin/events/:id" element={<AdminEventDetails />} />
                <Route path="/admin/broadcast" element={<AdminBroadcast />} />
                <Route path="/admin/tickets" element={<AdminTickets />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
