import { createApiClient } from '@reflexionia/sdk';
import { DEV_USER_EMAIL } from '../../config';

export const tokensApi = createApiClient({
  baseUrl: '',
  devUserEmail: DEV_USER_EMAIL,
});
