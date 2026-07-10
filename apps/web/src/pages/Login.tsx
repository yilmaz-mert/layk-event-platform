import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
import { cn } from '@layk/core';

type Mode = 'login' | 'signup';

interface LocationState {
  from?: { pathname: string; search: string };
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, profile } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as LocationState | null)?.from;

  function resolveDestination(role: 'admin' | 'user') {
    if (role === 'admin') return '/admin';
    if (from) return `${from.pathname}${from.search ?? ''}`;
    return '/';
  }

  // Redirect already-authenticated approved users away from the login page
  useEffect(() => {
    if (session && profile && profile.approval_status === 'approved') {
      navigate(resolveDestination(profile.role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile, navigate]);

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
    setAccessDenied(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setAccessDenied(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        setMessage({
          text: 'Hesabınız oluşturuldu! Giriş yapabilmeniz için lütfen bir yöneticinin hesabınızı onaylamasını bekleyin.',
          ok: true,
        });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (error) throw error;

        const { data: profile } = await supabase
          .from('users')
          .select('role, approval_status')
          .eq('id', data.user.id)
          .single();

        if (profile && profile.role !== 'admin' && profile.approval_status !== 'approved') {
          await supabase.auth.signOut();
          setAccessDenied(
            profile.approval_status === 'rejected'
              ? 'Hesap başvurunuz reddedildi.'
              : 'Giriş başarısız: Hesabınız yönetici onayı bekliyor.',
          );
          return;
        }

        navigate(resolveDestination(profile?.role === 'admin' ? 'admin' : 'user'), { replace: true });
      }
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.',
        ok: false,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">L&apos;Ayk</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === 'login' ? 'Hesabınıza giriş yapın' : 'Yeni bir hesap oluşturun'}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-8 shadow-sm">
          {accessDenied && (
            <div className="mb-6 flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">Erişim Reddedildi</p>
                <p className="mt-0.5 text-sm text-destructive/90">{accessDenied}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="text-sm font-medium text-foreground">
                  Ad Soyad
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ayşe Yılmaz"
                  className={inputClass}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                E-posta
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="siz@ornek.com"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Şifre
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {message && (
              <p
                className={cn(
                  'rounded-lg px-3 py-2 text-sm',
                  message.ok
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-destructive/10 text-destructive',
                )}
              >
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Lütfen bekleyin…'
                : mode === 'login'
                  ? 'Giriş Yap'
                  : 'Hesap Oluştur'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? 'Hesabınız yok mu?' : 'Zaten bir hesabınız var mı?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {mode === 'login' ? 'Kayıt olun' : 'Giriş yapın'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
