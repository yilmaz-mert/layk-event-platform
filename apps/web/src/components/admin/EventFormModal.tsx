import { useEffect, useId, useRef, useState } from 'react';
import { ImageIcon, X } from 'lucide-react';
import { supabase, cn } from '@layk/core';
import { useToast } from '@/components/Toast';
import Switch from '@/components/Switch';
import type { EventCategory } from '@/components/CategoryManagerModal';
import { categoryDotStyle } from '@/lib/eventDisplay';
import { statusLabels, type EventStatus } from './eventStatus';
import AdminDialog from './AdminDialog';
import ConfirmDialog from './ConfirmDialog';

export interface AdminEventRecord {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  booked_count: number;
  max_tickets_per_user: number;
  category: string | null;
  category_id: string | null;
  price: number;
  location: string | null;
  is_published: boolean;
  is_archived: boolean;
  status: EventStatus;
  created_at: string;
  event_categories: { name: string; color_code: string } | null;
}

interface FormState {
  title: string;
  description: string;
  event_date: string;
  capacity: string;
  category_id: string;
  price: string;
  location: string;
  is_published: boolean;
  image: File | null;
  existingImageUrl: string | null;
  maxTickets: string;
  status: EventStatus;
}

type FieldKey = 'title' | 'event_date' | 'capacity' | 'maxTickets' | 'price';
type Errors = Partial<Record<FieldKey, string>>;

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  event_date: '',
  capacity: '',
  category_id: '',
  price: '0',
  location: '',
  is_published: true,
  image: null,
  existingImageUrl: null,
  maxTickets: '5',
  status: 'active',
};

// text-base on phones keeps iOS from zooming into focused fields.
export const adminInputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground sm:text-sm pointer-coarse:min-h-11 ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition aria-[invalid=true]:border-destructive';

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validate(form: FormState): Errors {
  const errors: Errors = {};
  const cap = parseInt(form.capacity, 10);
  const maxTix = parseInt(form.maxTickets, 10);
  const price = parseFloat(form.price);
  if (!form.title.trim()) errors.title = 'Başlık gereklidir.';
  if (!form.event_date) errors.event_date = 'Etkinlik tarihi gereklidir.';
  if (isNaN(cap) || cap < 1) errors.capacity = 'Kontenjan pozitif bir sayı olmalıdır.';
  if (isNaN(maxTix) || maxTix < 1) errors.maxTickets = 'Kullanıcı başına maksimum bilet en az 1 olmalıdır.';
  if (isNaN(price) || price < 0) errors.price = 'Fiyat geçerli bir sayı olmalıdır.';
  return errors;
}

function bannerFileName(file: File): string {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const safeName = file.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .toLowerCase();
  return `${Date.now()}-${safeName}.${ext}`;
}

/**
 * Removes a banner uploaded by a save that then failed — but only once a read
 * proves no event row points at it (the write may have committed even though
 * its response failed). Any doubt keeps the file: an orphan costs storage, a
 * wrong delete breaks an event's image.
 */
async function discardUnsavedUpload(fileName: string, publicUrl: string) {
  const { data, error } = await supabase.from('events').select('id').eq('image_url', publicUrl).limit(1);
  if (error || !data || data.length > 0) return;
  await supabase.storage.from('event-banners').remove([fileName]);
}

const STATUS_OPTIONS: { value: EventStatus; hint: string }[] = [
  { value: 'active', hint: 'Rezervasyona açık.' },
  { value: 'completed', hint: 'Etkinlik gerçekleşti; kapanış notu eklenebilir.' },
  { value: 'cancelled', hint: 'Onaylı rezervasyonu olan herkese bildirim gönderilir.' },
];

const FIELD_ORDER: FieldKey[] = ['title', 'event_date', 'capacity', 'maxTickets', 'price'];

/** Tracks the visual viewport so the sheet shrinks above the on-screen keyboard. */
function useVisualViewport() {
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const update = () => setVv({ height: v.height, top: v.offsetTop });
    update();
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => {
      v.removeEventListener('resize', update);
      v.removeEventListener('scroll', update);
    };
  }, []);
  return vv;
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="float-left mb-4 w-full text-sm font-semibold text-foreground">{title}</legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

export default function EventFormModal({
  editEvent,
  categories,
  onClose,
  onSaved,
}: {
  editEvent: AdminEventRecord | null;
  categories: EventCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = editEvent !== null;
  const { toast } = useToast();
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const titleId = fid('heading');
  const vv = useVisualViewport();

  const [initial] = useState<FormState>(() =>
    isEditing
      ? {
          title: editEvent.title,
          description: editEvent.description ?? '',
          event_date: toDatetimeLocalValue(editEvent.event_date),
          capacity: editEvent.capacity.toString(),
          category_id: editEvent.category_id ?? '',
          price: editEvent.price.toString(),
          location: editEvent.location ?? '',
          is_published: editEvent.is_published,
          image: null,
          existingImageUrl: editEvent.image_url,
          maxTickets: editEvent.max_tickets_per_user.toString(),
          status: editEvent.status,
        }
      : EMPTY_FORM,
  );
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const dirty =
    form.image !== null ||
    (Object.keys(initial) as (keyof FormState)[]).some((k) => k !== 'image' && form[k] !== initial[k]);

  function requestClose() {
    if (submitting) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const displayedPreview = preview ?? form.existingImageUrl;
  const selectedCategory = categories.find((c) => c.id === form.category_id) ?? null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in errors) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function inputProps(key: FieldKey) {
    return {
      id: fid(key),
      'aria-invalid': errors[key] ? true : undefined,
      'aria-describedby': errors[key] ? `${fid(key)}-error` : undefined,
    } as const;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setForm((prev) => ({ ...prev, image: file }));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (file) {
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreview(url);
    } else {
      previewUrlRef.current = null;
      setPreview(null);
    }
  }

  function clearImage() {
    setForm((prev) => ({ ...prev, image: null, existingImageUrl: null }));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((k) => found[k]);
    if (firstInvalid) {
      document.getElementById(fid(firstInvalid))?.focus();
      return;
    }
    // Cancelling notifies every confirmed attendee (0012 trigger), so it asks first — same as the list.
    if (isEditing && form.status === 'cancelled' && editEvent.status !== 'cancelled') {
      setConfirmCancel(true);
      return;
    }
    await save();
  }

  async function save() {
    const cap = parseInt(form.capacity, 10);
    const maxTix = parseInt(form.maxTickets, 10);
    const price = parseFloat(form.price);

    setSubmitting(true);
    setSubmitError(null);
    let stage: 'upload' | 'save' = 'upload';
    let uploaded: { fileName: string; publicUrl: string } | null = null;
    try {
      // Upload first, then point the event at it. The event keeps its current
      // image_url until the save succeeds, so a failure at either step leaves
      // the existing banner working.
      let imageUrl: string | null = form.existingImageUrl;

      if (form.image) {
        const fileName = bannerFileName(form.image);
        const { error: uploadError } = await supabase.storage
          .from('event-banners')
          .upload(fileName, form.image, { upsert: false });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('event-banners')
          .getPublicUrl(fileName);
        uploaded = { fileName, publicUrl };
        imageUrl = publicUrl;
      }

      stage = 'save';
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: new Date(form.event_date).toISOString(),
        capacity: cap,
        max_tickets_per_user: maxTix,
        // category_id is the new source of truth; `category` (text) is kept
        // in sync so the 0013 capacity-alert trigger and the user_interests
        // upsert in EventDetails.tsx keep matching on it unmodified.
        category_id: form.category_id || null,
        category: selectedCategory?.name ?? null,
        price,
        location: form.location.trim() || null,
        is_published: form.is_published,
        image_url: imageUrl,
      };

      // A replaced or cleared banner is intentionally left in storage. The same
      // file can back another event, and scripts/rollback-event-images.sql plus
      // scripts/backups/* restore earlier image_url values — references the
      // browser cannot see, so it can never prove a delete is safe.
      const { error } = isEditing
        ? await supabase.from('events').update({ ...payload, status: form.status }).eq('id', editEvent.id)
        : await supabase.from('events').insert({ ...payload, status: 'active' });
      if (error) throw error;

      toast.success(isEditing ? 'Etkinlik başarıyla güncellendi!' : 'Etkinlik başarıyla oluşturuldu!');
      onSaved();
      onClose();
    } catch (err: unknown) {
      if (uploaded) await discardUnsavedUpload(uploaded.fileName, uploaded.publicUrl);
      // Supabase errors are plain objects with `message`, not Error instances.
      const message = (err as { message?: string } | null)?.message;
      const detail = message ? ` (${message})` : '';
      const keep = isEditing ? ' Mevcut görsel ve bilgiler değişmedi.' : '';
      // Shown inside the dialog: toasts sit under the modal top layer.
      setSubmitError(
        stage === 'upload'
          ? `Görsel yüklenemedi, etkinlik kaydedilmedi.${keep} Tekrar deneyin veya başka bir görsel seçin.${detail}`
          : `Etkinlik ${isEditing ? 'kaydedilemedi' : 'oluşturulamadı'}.${keep} Bağlantınızı kontrol edip tekrar deneyin.${detail}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <>
    <AdminDialog
      labelledBy={titleId}
      initialFocus={headingRef}
      onRequestClose={requestClose}
      onForcedClose={onClose}
      className="fixed inset-x-0 w-full items-end justify-center open:flex sm:items-center sm:p-4"
      // Follows the visual viewport so the footer stays above the on-screen keyboard.
      style={vv ? { top: vv.top, height: vv.height } : { top: 0, height: '100dvh' }}
    >
      <div className="relative flex h-full w-full flex-col bg-card sm:h-auto sm:max-h-full sm:max-w-xl sm:rounded-xl sm:border sm:shadow-lg">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground focus:outline-none">
            {isEditing ? 'Etkinliği düzenle' : 'Yeni etkinlik oluştur'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Formu kapat"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {errorCount > 0 && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorCount === 1 ? 'Bir alanı düzeltmeniz gerekiyor.' : `${errorCount} alanı düzeltmeniz gerekiyor.`}
              </p>
            )}

            {isEditing && (
              <Group title="Durum">
                <div className="grid gap-2">
                  {STATUS_OPTIONS.map(({ value, hint }) => (
                    <label
                      key={value}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40 has-checked:border-foreground has-checked:bg-muted/60 has-focus-visible:ring-2 has-focus-visible:ring-ring"
                    >
                      <input
                        type="radio"
                        name={fid('status')}
                        value={value}
                        checked={form.status === value}
                        onChange={() => set('status', value)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
                      />
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-medium', value === 'cancelled' ? 'text-destructive' : 'text-foreground')}>
                          {statusLabels[value]}
                        </span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </Group>
            )}

            <Group title="Temel bilgiler">
              <Field id={fid('title')} label="Başlık" required error={errors.title}>
                <input
                  type="text"
                  {...inputProps('title')}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="örn. Gelecek Teknoloji Konferansı 2026"
                  className={adminInputClass}
                />
              </Field>

              <Field id={fid('description')} label="Açıklama">
                <textarea
                  id={fid('description')}
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Etkinliğin kısa özeti…"
                  className={cn(adminInputClass, 'resize-y')}
                />
              </Field>

              <Field id={fid('category')} label="Kategori">
                <div className="relative">
                  {selectedCategory && (
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                      style={categoryDotStyle(selectedCategory.color_code)}
                      aria-hidden
                    />
                  )}
                  <select
                    id={fid('category')}
                    value={form.category_id}
                    onChange={(e) => set('category_id', e.target.value)}
                    className={cn(adminInputClass, selectedCategory && 'pl-8')}
                  >
                    <option value="">Kategori seçilmedi</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </Field>
            </Group>

            <Group title="Zaman ve yer">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid('event_date')} label="Tarih ve saat" required error={errors.event_date}>
                  <input
                    type="datetime-local"
                    {...inputProps('event_date')}
                    value={form.event_date}
                    onChange={(e) => set('event_date', e.target.value)}
                    className={adminInputClass}
                  />
                </Field>
                <Field id={fid('location')} label="Konum">
                  <input
                    id={fid('location')}
                    type="text"
                    value={form.location}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="örn. İstanbul Kongre Merkezi"
                    className={adminInputClass}
                  />
                </Field>
              </div>
            </Group>

            <Group title="Kontenjan ve fiyat">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id={fid('capacity')} label="Kontenjan" required error={errors.capacity}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    {...inputProps('capacity')}
                    value={form.capacity}
                    onChange={(e) => set('capacity', e.target.value)}
                    placeholder="100"
                    className={adminInputClass}
                  />
                </Field>
                <Field id={fid('maxTickets')} label="Kişi başı bilet" required error={errors.maxTickets}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    {...inputProps('maxTickets')}
                    value={form.maxTickets}
                    onChange={(e) => set('maxTickets', e.target.value)}
                    placeholder="5"
                    className={adminInputClass}
                  />
                </Field>
                <Field id={fid('price')} label="Fiyat (₺)" error={errors.price}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    {...inputProps('price')}
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder="0"
                    className={adminInputClass}
                  />
                </Field>
              </div>
            </Group>

            <Group title="Yayın ve görsel">
              <div className="space-y-1">
                <Switch
                  checked={form.is_published}
                  onChange={(v) => set('is_published', v)}
                  label={form.is_published ? 'Yayında' : 'Taslak'}
                  id={fid('published')}
                  className="min-h-11"
                />
                <p className="pl-14 text-xs text-muted-foreground">
                  {form.is_published ? 'Kullanıcılar etkinliği görebilir.' : 'Etkinlik yalnızca yöneticilere görünür.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-foreground">Banner görseli</span>
                {displayedPreview ? (
                  // Whole image at its own ratio (4:5 posters, landscape or square). Phones: full field
                  // width, natural height. sm+: framed and height-capped as before.
                  <div className="flex justify-center sm:rounded-lg sm:border sm:bg-muted/40 sm:p-2">
                    <div className="relative w-full sm:w-auto">
                      <img
                        src={displayedPreview}
                        alt="Banner önizlemesi"
                        className="block h-auto w-full rounded-lg sm:max-h-80 sm:w-auto sm:max-w-full sm:rounded-md"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        aria-label="Görseli kaldır"
                        className="group absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors group-hover:bg-background">
                          <X className="h-4 w-4" aria-hidden />
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-input px-4 py-6 text-center transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
                    <span className="text-sm text-foreground">Görsel seç</span>
                    <span className="text-xs text-muted-foreground">PNG, JPG veya WEBP</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">Önerilen görsel boyutu: 1080 × 1350 px (4:5)</p>
              </div>
            </Group>
          </div>

          {submitError && (
            <p role="alert" className="shrink-0 border-t bg-destructive/10 px-4 py-2.5 text-sm text-destructive sm:px-6">
              {submitError}
            </p>
          )}
          <div className="flex shrink-0 gap-3 border-t bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:justify-end sm:px-6 sm:pb-4">
            <button
              type="button"
              onClick={requestClose}
              disabled={submitting}
              className="h-11 flex-1 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:h-10 sm:pointer-coarse:h-11 sm:flex-none"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="h-11 flex-[2] rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:pointer-coarse:h-11 sm:flex-none"
            >
              {submitting
                ? isEditing ? 'Kaydediliyor…' : 'Oluşturuluyor…'
                : isEditing ? 'Değişiklikleri kaydet' : 'Etkinliği oluştur'}
            </button>
          </div>
        </form>
      </div>
    </AdminDialog>

    {confirmCancel && (
      <ConfirmDialog
        title="Etkinlik iptal edilsin mi?"
        confirmLabel="Etkinliği iptal et"
        onConfirm={() => { setConfirmCancel(false); void save(); }}
        onCancel={() => setConfirmCancel(false)}
      >
        <p>
          <span className="font-medium text-foreground">{form.title.trim() || editEvent?.title}</span> iptal edildi olarak
          işaretlenecek ve onaylı rezervasyonu olan herkese bildirim gönderilecek.
        </p>
      </ConfirmDialog>
    )}

    {confirmDiscard && (
      <ConfirmDialog
        title="Kaydedilmemiş değişiklikler var"
        confirmLabel="Değişiklikleri at"
        cancelLabel="Düzenlemeye dön"
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        onCancel={() => setConfirmDiscard(false)}
      >
        <p>Formu kapatırsanız yaptığınız değişiklikler kaydedilmeyecek.</p>
      </ConfirmDialog>
    )}
    </>
  );
}
