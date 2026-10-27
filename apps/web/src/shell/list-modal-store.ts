import { create } from 'zustand';

export interface ListModalRequest {
  readonly project?: boolean;
  readonly folderId?: string | null;
  readonly editId?: string;
}

interface ListModalStore {
  readonly request: ListModalRequest | null;
  readonly open: (request: ListModalRequest) => void;
  readonly close: () => void;
}

export const useListModalStore = create<ListModalStore>((set) => ({
  request: null,
  open: (request) => {
    set({ request });
  },
  close: () => {
    set({ request: null });
  },
}));

/** Opens the new-list dialog from any screen. `project` turns on «Es un proyecto». */
export function openListModal(options: { project?: boolean; folderId?: string | null } = {}): void {
  useListModalStore.getState().open(options);
}
