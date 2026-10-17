import { en } from './en';
import { es } from './es';

export type Messages = { [K in keyof typeof es]: string };

export function messagesFor(locale: string): Messages {
  if (locale.toLowerCase().startsWith('en')) {
    return en;
  }
  return es;
}

export function fill(template: string, name: string): string {
  return template.replace('{name}', name);
}

export function captureLanguage(locale: string): 'es' | 'en' {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'es';
}
