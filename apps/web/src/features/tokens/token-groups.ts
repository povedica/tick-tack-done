import type { Token } from '@reflexionia/sdk';

export interface TokenGroup {
  readonly id: string;
  readonly name: string | null;
  readonly items: Token[];
}

/** OAuth identity is the client id, never its self-declared display name. */
export function groupTokens(tokens: readonly Token[]): TokenGroup[] {
  const groups = new Map<string, TokenGroup>();
  for (const token of tokens) {
    const id = token.oauth_client_id ?? 'manual';
    let group = groups.get(id);
    if (group === undefined) {
      group = { id, name: token.oauth_client_id === null ? null : token.client_name, items: [] };
      groups.set(id, group);
    }
    group.items.push(token);
  }
  return [...groups.values()];
}

export function tokenExpired(token: Pick<Token, 'expires_at'>, now: number): boolean {
  return token.expires_at !== null && Date.parse(token.expires_at) <= now;
}
