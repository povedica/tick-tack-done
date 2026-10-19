import { create } from 'zustand';

interface ActionToastState {
  text: string | null;
  undo: (() => void) | null;
  show: (text: string, undo?: () => void) => void;
  clear: () => void;
}

export const useActionToast = create<ActionToastState>((set) => ({
  text: null,
  undo: null,
  show: (text, undo) => {
    set({ text, undo: undo ?? null });
  },
  clear: () => {
    set({ text: null, undo: null });
  },
}));
