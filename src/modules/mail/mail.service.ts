import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Envio de e-mail por SMTP. Sem SMTP_HOST configurado, apenas registra no log. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('MAIL_FROM');
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get<number>('SMTP_PORT') ?? 1025,
          secure: false,
          auth: user
            ? { user, pass: config.get<string>('SMTP_PASS') ?? '' }
            : undefined,
        })
      : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[e-mail não enviado: SMTP desligado] para=${message.to} assunto="${message.subject}"`,
      );
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
