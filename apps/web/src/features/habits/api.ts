import { createApiClient } from '@reflexionia/sdk';
import { DEV_USER_EMAIL } from '../../config';

export const habitsApi = createApiClient({
  baseUrl: '',
  devUserEmail: DEV_USER_EMAIL,
});
