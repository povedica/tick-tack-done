import { create } from 'zustand';

export interface CaptureWarningNotice {
  readonly code:
    | 'list_not_found'
    | 'list_created'
    | 'tag_not_found'
    | 'tag_created'
    | 'reminder_without_date';
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
  readonly title: string;
  readonly warnings: readonly CaptureWarningNotice[];
}

interface NoticeStore {
  notice: CaptureNotice | null;
  setNotice: (notice: CaptureNotice) => void;
}

export const useCaptureNotice = create<NoticeStore>((set) => ({
  notice: null,
  setNotice: (notice) => {
    set({ notice });
  },
}));
