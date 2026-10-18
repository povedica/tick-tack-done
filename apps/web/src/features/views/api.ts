import { createApiClient } from '@reflexionia/sdk';
import { DEV_USER_EMAIL } from '../../config';

export const viewsApi = createApiClient({
  baseUrl: '',
  devUserEmail: DEV_USER_EMAIL,
});
