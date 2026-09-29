type NamedUser = { full_name: string | null; email: string };

/** Name to show for a user; falls back to the email when no name was entered. */
export const displayName = (u: NamedUser) => u.full_name?.trim() || u.email;

/** Two-letter avatar initials from the name (first + last word), else from the email. */
export function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}
