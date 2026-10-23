import { sendEmail } from '../mail/send-email.js';

/** Best-effort notice: mail errors must not block password changes or account deletion (S-15). */
export async function sendSecurityNotice(to: string, subject: string, text: string): Promise<void> {
  await sendEmail({ to, subject, text });
}
