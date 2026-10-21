import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIEW_PREFS,
  patchViewPrefs,
  readViewPrefs,
  writeViewPrefs,
} from './view-prefs';

const store = new Map<string, string>();

describe('ViewPrefs (TTD-AUD-59)', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  it('returns defaults when nothing is stored', () => {
    expect(readViewPrefs('list:inbox')).toEqual(DEFAULT_VIEW_PREFS);
  });

  it('persists group, sort and hideCompleted across reads', () => {
    writeViewPrefs('smart:today', {
      ...DEFAULT_VIEW_PREFS,
      group: 'priority',
      sort: 'date',
      hideCompleted: false,
    });
    expect(readViewPrefs('smart:today')).toMatchObject({
      group: 'priority',
      sort: 'date',
      hideCompleted: false,
    });
  });

  it('patchViewPrefs merges without dropping other fields', () => {
    writeViewPrefs('list:a', { ...DEFAULT_VIEW_PREFS, view: 'kanban', showDetails: false });
    const next = patchViewPrefs('list:a', { group: 'tag' });
    expect(next).toMatchObject({ view: 'kanban', showDetails: false, group: 'tag' });
  });

  it('migrates legacy view-only storage', () => {
    store.set('tick-tack-done.view.list:x', 'timeline');
    expect(readViewPrefs('list:x').view).toBe('timeline');
  });
});
