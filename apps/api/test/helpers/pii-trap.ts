/**
 * CA-05 trap values. Every one carries the TRAMPA marker so a single search
 * over a serialized log line or error event proves nothing leaked.
 */
export const TRAP = {
  email: 'trampa.persona@example.test',
  pat: 'rfx_pat_TRAMPApatSecret0123456789',
  oauthRefresh: 'rfx_ort_TRAMPAortSecret0123456789',
  session: '__Host-rfx_session=TRAMPAsessionValue',
  feedToken: 'TRAMPAfeedToken0123456789',
  publicListToken: 'TRAMPAlistToken0123456789',
  title: 'Llamar al TRAMPA médico',
  rawText: 'raw_text TRAMPA mañana a las 9',
  query: 'q=TRAMPAquery',
} as const;

/** Substrings that must never appear in anything that leaves the process. */
export const FORBIDDEN = [
  'TRAMPA',
  'trampa',
  TRAP.title,
  'raw_text',
  TRAP.email,
  'rfx_pat_',
  'rfx_ort_',
  '__Host-rfx_session',
] as const;

export function leaks(serialized: string): string[] {
  return FORBIDDEN.filter((needle) => serialized.includes(needle));
}
