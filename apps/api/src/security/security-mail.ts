import { sendEmail } from '../mail/send-email.js';
import { renderPlainNotice } from '../mail/templates/layout.js';

/** Best-effort notice: mail errors must not block password changes or account deletion (S-15). */
export async function sendSecurityNotice(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<void> {
  const wrapped =
    html === undefined
      ? renderPlainNotice({ locale: 'es', title: subject, body: text })
      : { text, html };
  await sendEmail({ to, subject, text: wrapped.text, html: wrapped.html });
}
