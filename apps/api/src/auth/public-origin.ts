/** Public site origin. Metadata, issuer and resource URLs all use this value. */
export function publicOrigin(): string {
  const configured = process.env.PUBLIC_URL?.trim() ?? '';
  const origin = (configured.length > 0 ? configured : 'https://todo.reflexionia.com').replace(
    /\/$/,
    '',
  );
  return origin;
}

export function mcpResourceUrl(): string {
  return `${publicOrigin()}/api/v1/mcp`;
}

export function protectedResourceMetadataUrl(): string {
  return `${publicOrigin()}/.well-known/oauth-protected-resource`;
}
