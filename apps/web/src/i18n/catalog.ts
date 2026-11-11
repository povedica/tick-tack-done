import type { es } from './es';

export type Messages = { [K in keyof typeof es]: string };

type Language = 'es' | 'en';

const catalogs = new Map<Language, Messages>();

export function languageOf(locale: string): Language {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export function installMessages(language: Language, messages: Messages): void {
  catalogs.set(language, messages);
}

export function messagesFor(locale: string): Messages {
  const language = languageOf(locale);
  const messages = catalogs.get(language);
  if (messages === undefined) {
    throw new Error(`i18n catalog ${language} is not loaded`);
  }
  return messages;
}

/** Loads only the active language. The other catalog stays out of this graph. */
export async function loadMessages(locale: string): Promise<Messages> {
  const language = languageOf(locale);
  const cached = catalogs.get(language);
  if (cached !== undefined) {
    return cached;
  }
  if (language === 'en') {
    const module = await import('./en');
    installMessages('en', module.en);
    return module.en;
  }
  const module = await import('./es');
  installMessages('es', module.es);
  return module.es;
}
