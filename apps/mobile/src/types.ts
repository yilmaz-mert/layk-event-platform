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

// Real DB table: conversations (id, user_id, subject, status, created_at)
export interface Conversation {
  id: string;
  user_id: string;
  subject: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  users?: { full_name: string | null; email: string };
}

// Backward-compat alias — existing imports of SupportTicket continue to work.
export type SupportTicket = Conversation;

// Real DB table: messages (id, conversation_id, sender_id, content, created_at)
// sender_name is NOT stored in the DB; it is populated client-side via a users join.
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

// Backward-compat alias
export type TicketMessage = Message;
