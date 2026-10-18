let csrfToken: string | undefined;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function readCsrfToken(): string | undefined {
  return csrfToken;
}
