import { ShieldCheck } from 'lucide-react';
import { cn } from '@layk/core';

// Account (approval + role) types and their read-only labels, shared by the user list and the user dialog.

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface UserRecord {
  id: string;
  full_name: string | null;
  email: string;
  phone_number: string | null;
  role: 'admin' | 'user';
  approval_status: ApprovalStatus;
  created_at: string;
}

const approvalLabels: Record<ApprovalStatus, string> = {
  pending: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

const approvalTone: Record<ApprovalStatus, string> = {
  pending: 'text-warning',
  approved: 'text-success',
  rejected: 'text-destructive',
};

export function ApprovalLabel({ status }: { status: ApprovalStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', approvalTone[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {approvalLabels[status]}
    </span>
  );
}

export function RoleLabel({ role }: { role: UserRecord['role'] }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      Yönetici
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Kullanıcı</span>
  );
}

export function SelfBadge() {
  return <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Siz</span>;
}
