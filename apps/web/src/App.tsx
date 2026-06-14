import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@layk/core';
import { ToastProvider } from '@/components/Toast';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserLayout from '@/components/UserLayout';
import AdminLayout from '@/components/AdminLayout';
import Login from '@/pages/Login';
import UserFeed from '@/pages/UserFeed';
import MyBookings from '@/pages/MyBookings';
import UserProfile from '@/pages/UserProfile';
import EventDetails from '@/pages/EventDetails';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminEvents from '@/pages/AdminEvents';
import AdminEventDetails from '@/pages/AdminEventDetails';
import AdminBroadcast from '@/pages/AdminBroadcast';
import AdminTickets from '@/pages/AdminTickets';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute allowedRole="user" />}>
              <Route element={<UserLayout />}>
                <Route path="/" element={<UserFeed />} />
                <Route path="/my-bookings" element={<MyBookings />} />
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/events/:id" element={<EventDetails />} />
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
