export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

const sessionMode = import.meta.env.VITE_AUTH_MODE === 'session';
let csrfToken: string | undefined;
let status: SessionStatus = sessionMode ? 'unknown' : 'authenticated';
let generation = 0;
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
  if (next === 'authenticated') {
    generation += 1;
  }
  status = next;
  emit();
}

export function rejectSession(check: number): void {
  if (check !== generation) {
    return;
  }
  status = 'anonymous';
  csrfToken = undefined;
  emit();
}
