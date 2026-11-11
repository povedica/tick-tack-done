interface Grecaptcha {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let loading: Promise<void> | null = null;

export function recaptchaSiteKey(): string {
  return import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
}

/** Returns a v3 token, or undefined when the public site key is not configured. */
export async function recaptchaToken(action: string): Promise<string | undefined> {
  const siteKey = recaptchaSiteKey();
  if (siteKey.length === 0) {
    return undefined;
  }
  await loadRecaptcha(siteKey);
  const grecaptcha = window.grecaptcha;
  if (grecaptcha === undefined) {
    throw new Error('recaptcha_unavailable');
  }
  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(siteKey, { action }).then(resolve, reject);
    });
  });
}

function loadRecaptcha(siteKey: string): Promise<void> {
  if (window.grecaptcha !== undefined) {
    return Promise.resolve();
  }
  if (loading !== null) {
    return loading;
  }
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('recaptcha_unavailable'));
    };
    document.head.append(script);
  });
  return loading;
}
