import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

export type MailStatus = 'enviado' | 'error' | 'sin_configurar';

let transport: Transporter | null = null;
export const mailConfigured = () => Boolean(config.smtpUrl && config.mailFrom);

/** Envía un correo si hay SMTP configurado. Nunca simula un envío exitoso. */
export async function sendMail(to: string, subject: string, text: string): Promise<MailStatus> {
  if (!mailConfigured()) return 'sin_configurar';
  try {
    transport ??= nodemailer.createTransport(config.smtpUrl);
    await transport.sendMail({ from: config.mailFrom, to, subject, text });
    return 'enviado';
  } catch (e) {
    console.error('Error enviando correo:', (e as Error).message);
    return 'error';
  }
}
