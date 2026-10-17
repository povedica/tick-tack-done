import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';

/** Declares the scopes a route will require once PATs exist (section 10.1). */
export const Scopes = (...scopes: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(SCOPES_KEY, scopes);
