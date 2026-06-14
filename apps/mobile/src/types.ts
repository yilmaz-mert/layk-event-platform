// ── Shared domain types for the L'Ayk mobile app ────────────────────────────
// Mirror the exact shape of the Supabase tables used by the web app.

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

// Flattened shape used in MyBookings (reservation + joined event fields)
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

export interface SupportTicket {
  id: string;
  reservation_id: string;
  user_id: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}
