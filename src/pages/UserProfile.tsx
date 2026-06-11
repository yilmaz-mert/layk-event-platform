import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

export default function UserProfile() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) fetchProfile(profile.id);
  }, [profile?.id]);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('full_name, phone_number')
      .eq('id', userId)
      .single();

    if (data) {
      setFullName(data.full_name ?? '');
      setPhoneNumber(data.phone_number ?? '');
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.id) return;
    setSaving(true);

    const { error } = await supabase
      .from('users')
      .update({
        full_name: fullName.trim() || null,
        phone_number: phoneNumber.trim() || null,
      })
      .eq('id', profile.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Profile updated successfully.');
    }

    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">My Profile</h1>
          <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {loading ? (
          <div className="animate-pulse space-y-5">
            {[80, 160, 80, 160, 80, 160, 96].map((w, i) => (
              <div
                key={i}
                className="rounded bg-muted"
                style={{ height: i % 2 === 0 ? '16px' : '42px', width: `${w}%` }}
              />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={profile?.email ?? ''}
                disabled
                className={cn(inputClass, 'cursor-not-allowed opacity-60')}
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
            </div>

            <div className="border-t pt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
