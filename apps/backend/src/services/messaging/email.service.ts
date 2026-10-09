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

const configured = (): boolean => Boolean(config.SENDGRID_API_KEY || config.SMTP_HOST);

export const emailService = {
  isConfigured(): boolean {
    return configured();
  },

  async send({ to, subject, text, html }: EmailMessage): Promise<boolean> {
    if (!configured()) {
      logger.info('[email] skipped (not configured)');
      return false;
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
