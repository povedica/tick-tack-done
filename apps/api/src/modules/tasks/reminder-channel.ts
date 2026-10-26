import { emailConfigured } from '../../mail/send-email.js';
/** RF-802: prefer an available delivery channel for newly created reminders. */
export function defaultReminderChannel(): 'push' | 'email' {
  if (process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()) return 'push';
  return emailConfigured() ? 'email' : 'push';
}
