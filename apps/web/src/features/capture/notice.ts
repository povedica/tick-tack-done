import { create } from 'zustand';
import type { DateDraft } from '../../components/DatePopover';
import type { CalendarSlot } from './calendar-slot';

export interface CaptureDraft {
  readonly text: string;
  readonly content?: string;
  readonly date?: DateDraft | null;
  readonly priority?: 'none' | 'low' | 'medium' | 'high' | undefined;
  readonly project?: string | null;
  readonly columnId?: string | null;
  readonly tags?: string[] | null;
  readonly files?: File[];
  readonly kind?: 'task' | 'note';
  readonly slot?: CalendarSlot | undefined;
  readonly defaultProjectId?: string | undefined;
}

export interface CaptureWarningNotice {
  readonly code:
    'list_not_found' | 'list_created' | 'tag_not_found' | 'tag_created' | 'reminder_without_date';
  readonly name?: string;
}

const WARNING_CODES = new Set<CaptureWarningNotice['code']>([
  'list_not_found',
  'list_created',
  'tag_not_found',
  'tag_created',
  'reminder_without_date',
]);

export function noticesFrom(warnings: unknown): CaptureWarningNotice[] {
  if (!Array.isArray(warnings)) {
    return [];
  }
  const notices: CaptureWarningNotice[] = [];
  for (const item of warnings) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const code = (item as { code?: unknown }).code;
    const name = (item as { name?: unknown }).name;
    if (typeof code !== 'string' || !WARNING_CODES.has(code as CaptureWarningNotice['code'])) {
      continue;
    }
    notices.push({
      code: code as CaptureWarningNotice['code'],
      ...(typeof name === 'string' ? { name } : {}),
    });
  }
  return notices;
}

export interface CaptureNotice {
  readonly when?: string | null;
  readonly title: string;
  readonly warnings: readonly CaptureWarningNotice[];
}

interface NoticeStore {
  notice: CaptureNotice | null;
  setNotice: (notice: CaptureNotice) => void;
  clear: () => void;
}

export const useCaptureNotice = create<NoticeStore>((set) => ({
  notice: null,
  setNotice: (notice) => {
    set({ notice });
  },
  clear: () => {
    set({ notice: null });
  },
}));

interface CaptureOpenState {
  open: boolean;
  text: string;
  draft: CaptureDraft | undefined;
  show: (value?: string | CaptureDraft) => void;
  hide: () => void;
}

export const useCaptureOpen = create<CaptureOpenState>((set) => ({
  open: false,
  text: '',
  draft: undefined,
  show: (value = '') => {
    const draft = typeof value === 'string' ? undefined : value;
    set({ open: true, text: typeof value === 'string' ? value : value.text, draft });
  },
  hide: () => {
    set({ open: false, text: '', draft: undefined });
  },
}));

/** Global shortcuts always open the same task card used by calendar capture. */
export function openTaskComposer(text: string | CaptureDraft = ''): void {
  if (useCaptureOpen.getState().open) return;
  useCaptureOpen.getState().show(text);
}
