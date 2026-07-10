import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@layk/core';
import { useToast } from '@/components/Toast';

export interface EventCategory {
  id: string;
  name: string;
  color_code: string;
}

interface CategoryManagerModalProps {
  categories: EventCategory[];
  onClose: () => void;
  onChanged: () => void;
}

const nameInputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

export default function CategoryManagerModal({ categories, onClose, onChanged }: CategoryManagerModalProps) {
  const { toast } = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { name: string; color_code: string }>>({});
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function draftFor(cat: EventCategory) {
    return drafts[cat.id] ?? { name: cat.name, color_code: cat.color_code };
  }

  function updateDraft(cat: EventCategory, patch: Partial<{ name: string; color_code: string }>) {
    setDrafts((prev) => ({ ...prev, [cat.id]: { ...draftFor(cat), ...patch } }));
  }

  async function handleSave(cat: EventCategory) {
    const draft = draftFor(cat);
    if (!draft.name.trim()) return toast.error('Kategori adı boş olamaz.');

    setSavingId(cat.id);
    const { error } = await supabase
      .from('event_categories')
      .update({ name: draft.name.trim(), color_code: draft.color_code })
      .eq('id', cat.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Kategori güncellendi.');
      onChanged();
    }
    setSavingId(null);
  }

  async function handleDelete(cat: EventCategory) {
    setDeletingId(cat.id);
    const { error } = await supabase.from('event_categories').delete().eq('id', cat.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Kategori silindi.');
      onChanged();
    }
    setDeletingId(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return toast.error('Kategori adı gerekli.');

    setCreating(true);
    const { error } = await supabase
      .from('event_categories')
      .insert({ name: newName.trim(), color_code: newColor });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Kategori eklendi.');
      setNewName('');
      setNewColor('#6366f1');
      onChanged();
    }
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 my-4 w-full max-w-lg rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Kategorileri Yönet</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Henüz kategori eklenmemiş.</p>
          ) : (
            categories.map((cat) => {
              const draft = draftFor(cat);
              return (
                <div key={cat.id} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.color_code}
                    onChange={(e) => updateDraft(cat, { color_code: e.target.value })}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
                  />
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => updateDraft(cat, { name: e.target.value })}
                    className={nameInputClass}
                  />
                  <button
                    type="button"
                    onClick={() => handleSave(cat)}
                    disabled={savingId === cat.id}
                    className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {savingId === cat.id ? '...' : 'Kaydet'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat)}
                    disabled={deletingId === cat.id}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}

          <div className="flex items-center gap-2 border-t pt-4">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Yeni kategori adı"
              className={nameInputClass}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
