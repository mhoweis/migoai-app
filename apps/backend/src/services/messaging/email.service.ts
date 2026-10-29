import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import config from '../../config/env';
import logger from '../../utils/logger';

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const configured = (): boolean => Boolean(config.BREVO_API_KEY || config.SENDGRID_API_KEY || config.SMTP_HOST);

// "Migo <hello@example.com>" -> { name: 'Migo', email: 'hello@example.com' }
const parseAddress = (value: string): { name?: string; email: string } => {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || undefined, email: match[2].trim() } : { email: value.trim() };
};

const sendWithBrevo = async ({ to, subject, text, html }: EmailMessage): Promise<void> => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseAddress(config.EMAIL_FROM),
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Brevo responded ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }
};

/** Which provider will be used, for diagnostics. */
export const emailProvider = (): 'brevo' | 'sendgrid' | 'smtp' | 'not configured' => {
  if (config.BREVO_API_KEY) return 'brevo';
  if (config.SENDGRID_API_KEY) return 'sendgrid';
  if (config.SMTP_HOST) return 'smtp';
  return 'not configured';
};

export const emailService = {
  isConfigured(): boolean {
    return configured();
  },

  async send({ to, subject, text, html }: EmailMessage): Promise<boolean> {
    if (!configured()) {
      logger.info('[email] skipped (not configured)');
      return false;
    }

    if (config.BREVO_API_KEY) {
      await sendWithBrevo({ to, subject, text, html });
      return true;
    }

    if (config.SENDGRID_API_KEY) {
      sgMail.setApiKey(config.SENDGRID_API_KEY);
      await sgMail.send({
        to,
        from: config.EMAIL_FROM,
        subject,
        text,
        html,
      });
      return true;
    }

    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE ?? config.SMTP_PORT === 465,
      auth: config.SMTP_USER && config.SMTP_PASS
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
      // Fail fast instead of nodemailer's 2-minute defaults: some hosts
      // (e.g. Render's free plan) block outbound SMTP and the connection hangs.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
    return true;
  },
};
