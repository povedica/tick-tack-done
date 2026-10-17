import type { QuickAddParse } from '../types';

export type QuickAddLanguage = 'es' | 'en';

/** RF-102. The parser lands with quick add; the result type is the contract. */
export function parseQuickAdd(_text: string, _language: QuickAddLanguage): QuickAddParse {
  throw new Error('nlp is not implemented');
}
