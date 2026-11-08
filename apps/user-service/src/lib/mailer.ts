import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /** The single call-to-action link, kept separately so the dev mailbox can render a button. */
  actionUrl?: string;
}

export interface CapturedMail extends OutgoingMail {
  id: string;
  createdAt: string;
}

type Transport = 'smtp' | 'capture';

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * smtp    — real delivery; needs SMTP_HOST (and usually SMTP_USER/SMTP_PASS).
 * capture — development only: mail is held in this process's memory and shown in the
 *           dev mailbox, clearly labelled as not delivered. Never written to logs or disk.
 */
export function mailTransport(): Transport {
  const configured = process.env.MAIL_TRANSPORT ?? (isProduction() ? 'smtp' : 'capture');
  if (configured !== 'smtp' && configured !== 'capture') throw new Error(`Unknown MAIL_TRANSPORT "${configured}"`);
  if (configured === 'capture' && isProduction()) throw new Error('MAIL_TRANSPORT=capture is not allowed in production');
  return configured;
}

export function isMailCaptureEnabled(): boolean {
  return !isProduction() && mailTransport() === 'capture';
}

const MAX_CAPTURED = 50;
const captured: CapturedMail[] = [];

export function listCapturedMail(): CapturedMail[] {
  return isMailCaptureEnabled() ? [...captured] : [];
}

export function clearCapturedMail(): void {
  captured.length = 0;
}

// Typed from createTransport itself: nodemailer ships its own types and no longer exposes a namespace.
type SmtpTransport = ReturnType<typeof nodemailer.createTransport>;
let smtp: SmtpTransport | null = null;
function smtpTransport(): SmtpTransport {
  if (smtp) return smtp;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error('SMTP_HOST is not configured');
  const port = Number(process.env.SMTP_PORT || 587);
  smtp = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return smtp;
}

/**
 * Returns false instead of throwing on delivery failure: callers answer the user generically
 * either way (no account enumeration), and the user can ask for another link.
 * Logs carry the subject and transport only — never the address body, link or token.
 */
export async function sendMail(mail: OutgoingMail): Promise<boolean> {
  const transport = mailTransport();
  if (transport === 'capture') {
    captured.unshift({ ...mail, id: randomUUID(), createdAt: new Date().toISOString() });
    captured.length = Math.min(captured.length, MAX_CAPTURED);
    logger.info(`Email captured for the dev mailbox (not delivered): "${mail.subject}"`);
    return true;
  }
  try {
    await smtpTransport().sendMail({
      from: process.env.MAIL_FROM || 'Agentic Study <no-reply@localhost>',
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    logger.info(`Email sent via SMTP: "${mail.subject}"`);
    return true;
  } catch (err) {
    logger.error(`SMTP delivery failed for "${mail.subject}": ${(err as Error).message}`);
    return false;
  }
}

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// Tokens go in the URL fragment: browsers never send it to any server, so it stays out of
// access logs, proxies and Referer headers. The page submits it only after the user clicks.
export function verificationMail(to: string, firstName: string, token: string): OutgoingMail {
  const actionUrl = `${appUrl()}/auth/verify-email#token=${token}`;
  return {
    to,
    subject: 'Verify your email for Agentic Study',
    actionUrl,
    text: `Hi ${firstName},\n\nConfirm this is your email address to finish creating your account:\n${actionUrl}\n\nThe link works once and expires in 24 hours. If you didn't sign up, ignore this email.`,
  };
}

export function passwordResetMail(to: string, firstName: string, token: string): OutgoingMail {
  const actionUrl = `${appUrl()}/auth/reset-password#token=${token}`;
  return {
    to,
    subject: 'Reset your Agentic Study password',
    actionUrl,
    text: `Hi ${firstName},\n\nUse this link to choose a new password:\n${actionUrl}\n\nThe link works once and expires in 1 hour. If you didn't ask for this, ignore this email; your password is unchanged.`,
  };
}

export function accountExistsMail(to: string, firstName: string): OutgoingMail {
  const actionUrl = `${appUrl()}/auth/login`;
  return {
    to,
    subject: 'Someone tried to sign up with your email',
    actionUrl,
    text: `Hi ${firstName},\n\nSomeone tried to create an Agentic Study account with this address, but you already have one. You can sign in here:\n${actionUrl}\n\nIf this wasn't you, no action is needed.`,
  };
}
