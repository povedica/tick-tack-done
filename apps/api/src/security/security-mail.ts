import nodemailer from 'nodemailer';

/** Best-effort notice. Missing SMTP skips the send; deletion still proceeds (S-15). */
export async function sendSecurityNotice(to: string, subject: string, text: string): Promise<void> {
  const host = process.env.SMTP_HOST ?? '';
  const from = process.env.SMTP_FROM ?? '';
  if (host.length === 0 || from.length === 0 || to.length === 0) {
    return;
  }
  try {
    const user = process.env.SMTP_USER ?? '';
    const pass = process.env.SMTP_PASS ?? '';
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? '587'),
      secure: false,
      ...(user.length > 0 ? { auth: { user, pass } } : {}),
    });
    await transport.sendMail({ from, to, subject, text });
  } catch {
    return;
  }
}
