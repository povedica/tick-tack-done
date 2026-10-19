import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';
export const AUTHENTICATED_KEY = 'authenticated';
export const PUBLIC_KEY = 'public';

/** Declares the scopes a route requires (section 10.1). A PAT missing one gets 403 scope_missing. */
export const Scopes = (...scopes: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(SCOPES_KEY, scopes);

/** Requires a dev session or a PAT, without demanding a particular scope. */
export const Authenticated = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(AUTHENTICATED_KEY, true);

/** Opts a route out of the default-closed auth guard (S-17). */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(PUBLIC_KEY, true);
