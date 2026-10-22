import { afterEach, expect, it, vi } from 'vitest';
import { pickDriveFile } from './drive-picker';
import { taskFetch } from './task-http';
vi.mock('./task-http', () => ({ taskFetch: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it('TTD-AUD-99 Picker excludes folders and keeps Google credentials out of ttd requests', async () => {
  const include = vi.fn();
  let selected: ((data: { action: string; docs?: { id: string }[] }) => void) | undefined;
  class View {
    setIncludeFolders(value: boolean) {
      include(value);
      return this;
    }
  }
  class Builder {
    setOAuthToken(_value: string) {
      return this;
    }
    setDeveloperKey(_value: string) {
      return this;
    }
    setAppId(_value: string) {
      return this;
    }
    addView(_view: View) {
      return this;
    }
    setCallback(callback: typeof selected) {
      selected = callback;
      return this;
    }
    build() {
      return {
        setVisible: (value: boolean) => {
          if (value) selected?.({ action: 'picked', docs: [{ id: 'file' }] });
        },
      };
    }
  }
  const sdk = {
    picker: { DocsView: View, PickerBuilder: Builder },
    accounts: {
      oauth2: {
        initTokenClient: (options: { callback: (token: { access_token: string }) => void }) => ({
          requestAccessToken: () => { options.callback({ access_token: 'picker-only-token' }); },
        }),
      },
    },
  };
  vi.stubGlobal('window', {
    google: sdk,
    gapi: { load: (_name: string, options: { callback: () => void }) => { options.callback(); } },
  });
  vi.mocked(taskFetch).mockResolvedValue({
    client_id: 'public-client',
    api_key: 'browser-key',
    app_id: 'app',
  });
  expect(await pickDriveFile()).toBe('file');
  expect(include).toHaveBeenCalledWith(false);
  expect(taskFetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(taskFetch).mock.calls)).not.toContain('picker-only-token');
});
