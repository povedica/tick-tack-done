export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

const sessionMode = import.meta.env.VITE_AUTH_MODE === 'session';
let csrfToken: string | undefined;
let status: SessionStatus = sessionMode ? 'unknown' : 'authenticated';
let generation = 0;
/** TTD-AUD-29: bootstrap failed for network/5xx, not auth. */
let unreachable = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function readCsrfToken(): string | undefined {
  return csrfToken;
}

export function sessionStatus(): SessionStatus {
  return status;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function sessionCheckGeneration(): number {
  return generation;
}

export function markSession(next: SessionStatus, csrf?: string): void {
  if (csrf !== undefined) {
    csrfToken = csrf;
  }
  if (next !== 'unknown') generation += 1;
  if (next === 'anonymous') csrfToken = undefined;
  unreachable = false;
  status = next;
  emit();
}

export function rejectSession(check: number): void {
  if (check !== generation) {
    return;
  }
  unreachable = false;
  status = 'anonymous';
  csrfToken = undefined;
  emit();
}

export function markSessionUnreachable(): void {
  unreachable = true;
  emit();
}

export function clearSessionUnreachable(): void {
  unreachable = false;
  emit();
}

export function sessionUnreachable(): boolean {
  return unreachable;
}
