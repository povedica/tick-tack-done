import { create } from 'zustand';

interface ActionToastState {
  text: string | null;
  tone: 'info' | 'error';
  fail: (text: string) => void;
  undo: (() => void) | null;
  show: (text: string, undo?: () => void) => void;
  clear: () => void;
}

export const useActionToast = create<ActionToastState>((set) => ({
  text: null,
  tone: 'info',
  fail: (text) => {
    set({ text, tone: 'error', undo: null });
  },
  undo: null,
  show: (text, undo) => {
    set({ text, tone: 'info', undo: undo ?? null });
  },
  clear: () => {
    set({ text: null, tone: 'info', undo: null });
  },
}));
