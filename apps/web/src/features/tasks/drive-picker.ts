import { ApiError } from '@reflexionia/sdk';
import { taskFetch } from './task-http';
interface Picked {
  action: string;
  docs?: { id: string }[];
}
interface View {
  setIncludeFolders(include: boolean): View;
}
interface Picker {
  setVisible(visible: boolean): void;
  dispose?: () => void;
}
interface Builder {
  setOAuthToken(token: string): Builder;
  setDeveloperKey(key: string): Builder;
  setAppId(id: string): Builder;
  addView(view: View): Builder;
  setCallback(callback: (data: Picked) => void): Builder;
  build(): Picker;
}
interface GoogleSdk {
  picker: { DocsView: new () => View; PickerBuilder: new () => Builder };
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        callback: (token: { access_token?: string; error?: string }) => void;
        error_callback: () => void;
      }): { requestAccessToken(options: { prompt: string }): void };
    };
  };
}
interface PickerWindow {
  google?: GoogleSdk;
  gapi?: { load(name: string, options: { callback: () => void; onerror: () => void }): void };
}
let loading: Promise<void> | null = null;
function script(url: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      resolve();
      return;
    }
    const node = document.createElement('script');
    node.id = id;
    node.src = url;
    node.async = true;
    node.onload = () => {
      resolve();
    };
    node.onerror = () => {
      node.remove();
      reject(new ApiError(503, 'drive_picker_unavailable', 'Google Picker failed to load'));
    };
    document.head.append(node);
  });
}
async function sdk(): Promise<GoogleSdk> {
  const browser = window as unknown as PickerWindow;
  if (!browser.google?.accounts || !browser.gapi) {
    loading ??= Promise.all([
      script('https://apis.google.com/js/api.js', 'ttd-google-api'),
      script('https://accounts.google.com/gsi/client', 'ttd-google-identity'),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
    await loading;
  }
  const gapi = browser.gapi;
  if (!gapi) throw new ApiError(503, 'drive_picker_unavailable', 'Google Picker is unavailable');
  await new Promise<void>((resolve, reject) => {
    gapi.load('picker', {
      callback: resolve,
      onerror: () => {
        reject(new ApiError(503, 'drive_picker_unavailable', 'Google Picker is unavailable'));
      },
    });
  });
  if (!browser.google)
    throw new ApiError(503, 'drive_picker_unavailable', 'Google Picker is unavailable');
  return browser.google;
}
/** Picker obtains its own interactive drive.file grant; backend credentials never leave ttd. */
export async function pickDriveFile(): Promise<string | null> {
  const value = await taskFetch('GET', '/api/v1/integrations/drive/picker-config');
  const config = value as { client_id?: string; api_key?: string; app_id?: string };
  if (!config.client_id || !config.api_key || !config.app_id)
    throw new ApiError(503, 'drive_picker_not_configured', 'Drive Picker is not configured');
  const google = await sdk();
  return new Promise((resolve, reject) => {
    let picker: Picker | null = null;
    let settled = false;
    const finish = (id: string | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      picker?.setVisible(false);
      picker?.dispose?.();
      if (error) reject(error);
      else resolve(id);
    };
    const timeout = setTimeout(
      () => {
        finish(null);
      },
      10 * 60 * 1000,
    );
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.client_id ?? '',
      scope: 'https://www.googleapis.com/auth/drive.file',
      error_callback: () => {
        finish(
          null,
          new ApiError(
            403,
            'drive_picker_unavailable',
            'Google Picker authorization did not finish',
          ),
        );
      },
      callback: (token) => {
        if (!token.access_token) {
          finish(
            null,
            new ApiError(403, 'drive_picker_unavailable', 'Google Picker authorization failed'),
          );
          return;
        }
        picker = new google.picker.PickerBuilder()
          .setOAuthToken(token.access_token)
          .setDeveloperKey(config.api_key ?? '')
          .setAppId(config.app_id ?? '')
          .addView(new google.picker.DocsView().setIncludeFolders(false))
          .setCallback((data) => {
            if (data.action === 'picked') finish(data.docs?.[0]?.id ?? null);
            else if (data.action === 'cancel') finish(null);
          })
          .build();
        picker.setVisible(true);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}
