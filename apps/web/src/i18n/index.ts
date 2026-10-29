import { messagesFor, type Messages } from './catalog';
import { useLocale } from './locale';

export type { Messages };
export { installMessages, languageOf, loadMessages, messagesFor } from './catalog';

export function useMessages(): Messages {
  const choice = useLocale((state) => state.choice);
  const locale = choice === 'auto' ? navigator.language : choice;
  return messagesFor(locale);
}

export function fill(template: string, name: string): string {
  return template.replace('{name}', name);
}

export function captureLanguage(locale: string): 'es' | 'en' {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'es';
}
