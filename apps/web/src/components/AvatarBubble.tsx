import { cn } from '@layk/core';

interface AvatarBubbleProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  size?: number;
  className?: string;
}

function getInitials(fullName?: string | null): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase() || '?';
}

// Deterministic hue from the name so the same person always gets the same
// color, without needing to store a color anywhere.
function getInitialsColor(fullName?: string | null): { background: string; color: string } {
  const seed = fullName?.trim() || '?';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return {
    background: `hsl(${hue} 70% 50% / 0.15)`,
    color: `hsl(${hue} 65% 40%)`,
  };
}

export default function AvatarBubble({ avatarUrl, fullName, size = 48, className }: AvatarBubbleProps) {
  const dimension = `${size}px`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fullName ?? 'Kullanıcı'}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  const { background, color } = getInitialsColor(fullName);

  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{ width: dimension, height: dimension, backgroundColor: background, color, fontSize: size * 0.4 }}
    >
      {getInitials(fullName)}
    </div>
  );
}
