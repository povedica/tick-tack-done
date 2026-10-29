import { create } from 'zustand';

export type FilterPreset = 'high' | 'no_date' | 'overdue';

export type FilterEditorRequest =
  | { readonly kind: 'create'; readonly preset?: FilterPreset }
  | { readonly kind: 'edit'; readonly id: string };

export interface FilterDeleteRequest {
  readonly id: string;
  readonly name: string;
}

export interface FilterToast {
  readonly id: string;
  readonly name: string;
}

interface FilterUiStore {
  readonly editor: FilterEditorRequest | null;
  readonly deleting: FilterDeleteRequest | null;
  readonly toasts: readonly FilterToast[];
  readonly notice: string | null;
  readonly openCreate: (preset?: FilterPreset) => void;
  readonly openEdit: (id: string) => void;
  readonly closeEditor: () => void;
  readonly askDelete: (request: FilterDeleteRequest) => void;
  readonly cancelDelete: () => void;
  readonly pushToast: (toast: FilterToast) => void;
  readonly dropToast: (id: string) => void;
  readonly announce: (notice: string) => void;
}

export const useFilterUi = create<FilterUiStore>((set) => ({
  editor: null,
  deleting: null,
  toasts: [],
  notice: null,
  openCreate: (preset) => {
    set({ editor: preset === undefined ? { kind: 'create' } : { kind: 'create', preset } });
  },
  openEdit: (id) => {
    set({ editor: { kind: 'edit', id } });
  },
  closeEditor: () => {
    set({ editor: null });
  },
  askDelete: (request) => {
    set({ deleting: request });
  },
  cancelDelete: () => {
    set({ deleting: null });
  },
  pushToast: (toast) => {
    set((state) => ({ toasts: [...state.toasts, toast] }));
  },
  dropToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },
  announce: (notice) => {
    set({ notice });
  },
}));
