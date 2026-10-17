import { create } from 'zustand';

export interface CaptureWarningNotice {
  readonly code: 'list_not_found' | 'tag_not_found' | 'reminder_without_date';
  readonly name?: string;
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
