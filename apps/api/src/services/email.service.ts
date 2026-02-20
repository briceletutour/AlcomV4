import { promises as fs } from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Resend } from 'resend';
import logger from '../lib/logger';

export type EmailTemplateName =
  | 'invite-user'
  | 'password-reset'
  | 'invoice-approval'
  | 'shift-variance-alert'
  | 'incident-alert'
  | 'sla-overdue'
  | 'daily-digest';

interface RateLimitEntry {
  timestamps: number[];
}

class EmailService {
  private resend: Resend | null;
  private readonly templateDir: string;
  private readonly perRecipientLimit = 5;
  private readonly perRecipientWindowMs = 60_000;
  private readonly rateLimitState = new Map<string, RateLimitEntry>();

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.templateDir = path.join(__dirname, '..', 'templates', 'email');
  }

  async renderTemplate(templateName: EmailTemplateName, data: Record<string, unknown>): Promise<string> {
    const templatePath = path.join(this.templateDir, `${templateName}.hbs`);
    const source = await fs.readFile(templatePath, 'utf-8');
    const compiled = Handlebars.compile(source);
    return compiled(data);
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    attempt = 1
  ): Promise<void> {
    this.enforceRateLimit(to);

    if (!this.resend) {
      logger.warn(`Email provider not configured. Skipping email to ${to} (${subject}).`);
      return;
    }

    const from = process.env.EMAIL_FROM || 'noreply@alcom.cm';

    try {
      await this.resend.emails.send({
        from,
        to,
        subject,
        html: htmlBody,
      });
    } catch (error) {
      if (attempt >= 3) {
        throw error;
      }

      const retryDelayMs = process.env.NODE_ENV === 'test' ? 10 : 60_000;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      await this.sendEmail(to, subject, htmlBody, attempt + 1);
    }
  }

  private enforceRateLimit(recipient: string): void {
    const now = Date.now();
    const current = this.rateLimitState.get(recipient) || { timestamps: [] };
    const filtered = current.timestamps.filter((ts) => now - ts < this.perRecipientWindowMs);

    if (filtered.length >= this.perRecipientLimit) {
      throw new Error(`Rate limit exceeded for recipient: ${recipient}`);
    }

    filtered.push(now);
    this.rateLimitState.set(recipient, { timestamps: filtered });
  }
}

export const emailService = new EmailService();
