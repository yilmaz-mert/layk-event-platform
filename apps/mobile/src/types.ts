// ── Shared domain types for the L'Ayk mobile app ────────────────────────────

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: 'admin' | 'user';
  approval_status: 'pending' | 'approved' | 'rejected';
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  booked_count: number;
  max_tickets_per_user: number;
  category: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

export interface UserReservation {
  id: string;
  status: 'confirmed' | 'cancelled';
  tickets_requested: number;
}

export interface BookedEvent {
  reservation_id: string;
  event_id: string;
  title: string;
  event_date: string;
  event_status: 'active' | 'completed' | 'cancelled';
  status: 'confirmed' | 'cancelled';
  tickets_requested: number;
  created_at: string;
}

// ── Support system ────────────────────────────────────────────────────────────
// Maps exactly to the production DB tables defined in migration 0016.

// DB table: support_tickets (id, user_id, subject, status, created_at)
export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  users?: { full_name: string | null; email: string };
}

// DB table: ticket_messages (id, ticket_id, sender_id, sender_role, message, created_at)
export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'admin' | 'user';
  message: string;
  created_at: string;
}

// Backward-compat aliases — existing imports continue to work.
export type Conversation = SupportTicket;
export type Message = TicketMessage;
