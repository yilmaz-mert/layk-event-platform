import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, LifeBuoy, Loader2, Trash2, User } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import { cn } from '@layk/core';
import Switch from '@/components/Switch';
import AvatarBubble from '@/components/AvatarBubble';
import { processAvatarImage } from '@/lib/imageProcessing';
import UserSupportSection from '@/components/profile/UserSupportSection';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

export default function UserProfile() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') === 'support' ? 'support' : 'profile';

  // ── Profile form state ─────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Profile data ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (profile?.id) fetchProfile(profile.id);
  }, [profile?.id]);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('full_name, phone_number, address, is_private, avatar_url')
      .eq('id', userId)
      .single();
    if (data) {
      setFullName(data.full_name ?? '');
      setPhoneNumber(data.phone_number ?? '');
      setAddress(data.address ?? '');
      setIsPrivate(data.is_private ?? false);
      setAvatarUrl(data.avatar_url ?? null);
    }
    setProfileLoading(false);
  }

  // ── Avatar upload/delete ────────────────────────────────────────────────────
  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen bir görsel dosyası seçin.');
      return;
    }

    setAvatarUploading(true);
    try {
      const blob = await processAvatarImage(file);
      const path = `${profile.id}.webp`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/webp' });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust: the storage path never changes, so append a version to
      // force browsers/CDN to fetch the freshly overwritten file.
      const versionedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: dbError } = await supabase
        .from('users')
        .update({ avatar_url: versionedUrl })
        .eq('id', profile.id);
      if (dbError) throw dbError;

      setAvatarUrl(versionedUrl);
      toast.success('Profil fotoğrafı güncellendi.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAvatarDelete() {
    if (!profile?.id) return;
    setAvatarUploading(true);
    try {
      const { error: removeError } = await supabase.storage
        .from('avatars')
        .remove([`${profile.id}.webp`]);
      if (removeError) throw removeError;

      const { error: dbError } = await supabase
        .from('users')
        .update({ avatar_url: null })
        .eq('id', profile.id);
      if (dbError) throw dbError;

      setAvatarUrl(null);
      toast.success('Profil fotoğrafı kaldırıldı.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fotoğraf kaldırılamadı.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile?.id) return;
    setSaving(true);

    const trimmedName = fullName.trim() || null;
    const trimmedPhone = phoneNumber.trim() || null;
    const trimmedAddress = address.trim() || null;

    const { error } = await supabase
      .from('users')
      .update({
        full_name: trimmedName,
        phone_number: trimmedPhone,
        address: trimmedAddress,
        is_private: isPrivate,
      })
      .eq('id', profile.id);

    if (error) {
      toast.error(error.message);
      await fetchProfile(profile.id);
      setSaving(false);
      return;
    }

    await supabase.auth.updateUser({ data: { full_name: trimmedName, phone_number: trimmedPhone } });
    await fetchProfile(profile.id);
    toast.success('Profil güncellendi.');
    setSaving(false);
  }

  // ── Tab navigation ─────────────────────────────────────────────────────────
  function openProfileTab() { setSearchParams({}, { replace: true }); }
  function openSupportTab() { setSearchParams({ tab: 'support' }, { replace: true }); }

  return (
    <main
      className={cn(
        'mx-auto px-4 pb-16 pt-6 transition-[max-width]',
        activeTab === 'support' ? 'max-w-4xl' : 'max-w-lg',
      )}
    >
      {/* ── Page header ── */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          {activeTab === 'support' ? (
            <LifeBuoy className="h-5 w-5 text-primary" />
          ) : (
            <User className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">
            {activeTab === 'support' ? 'Destek Talepleri' : 'Profilim'}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="mb-6 flex border-b">
        <button
          type="button"
          onClick={openProfileTab}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition',
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <User className="h-4 w-4" />
          Profilim
        </button>
        <button
          type="button"
          onClick={openSupportTab}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition',
            activeTab === 'support'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <LifeBuoy className="h-4 w-4" />
          Destek Talepleri
        </button>
      </div>

      {/* ── Profile tab ── */}
      {activeTab === 'profile' && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {profileLoading ? (
            <div className="animate-pulse space-y-5">
              {/* Percent of the card width — must stay ≤100, wider rows overflow the page while loading. */}
              {[30, 100, 30, 100, 30, 100, 45].map((w, i) => (
                <div
                  key={i}
                  className="rounded bg-muted"
                  style={{ height: i % 2 === 0 ? '16px' : '42px', width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-6 flex justify-center">
                <div className="group relative">
                  <AvatarBubble avatarUrl={avatarUrl} fullName={fullName} size={96} />

                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    aria-label="Profil fotoğrafını değiştir"
                    className={cn(
                      'absolute inset-0 flex items-center justify-center rounded-full text-white',
                      'opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100',
                      'disabled:cursor-not-allowed',
                      avatarUploading && 'bg-black/40 opacity-100',
                    )}
                  >
                    {avatarUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6" />
                    )}
                  </button>

                  {avatarUrl && !avatarUploading && (
                    <button
                      type="button"
                      onClick={handleAvatarDelete}
                      aria-label="Profil fotoğrafını kaldır"
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border bg-card text-destructive shadow-sm transition hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Ad Soyad</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Adınız Soyadınız"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Telefon Numarası</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+90 555 000 00 00"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Adres</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Hediye teslimatı için adresiniz"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2 rounded-lg border bg-muted/30 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Switch
                      checked={isPrivate}
                      onChange={setIsPrivate}
                      id="is-private"
                      label="Gizli Hesap (Etkinlik Katılım Gizliliği)"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Katılımcı listelerinde diğer kullanıcılara görünmezsiniz. Diğer görünür
                    katılımcıları görmeye devam edebilirsiniz.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">E-posta</label>
                  <input
                    type="email"
                    value={profile?.email ?? ''}
                    disabled
                    className={cn(inputClass, 'cursor-not-allowed opacity-60')}
                  />
                  <p className="text-xs text-muted-foreground">E-posta buradan değiştirilemez.</p>
                </div>

                <div className="border-t pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* ── Support Tickets tab ── */}
      {activeTab === 'support' && profile?.id && <UserSupportSection userId={profile.id} />}
    </main>
  );
}
