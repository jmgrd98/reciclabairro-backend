import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Variáveis de ambiente aceitas pela aplicação. A API não sobe se alguma for inválida. */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  /** Endereço do frontend; usado nos links enviados por e-mail. */
  APP_PUBLIC_URL: z.string().default('http://localhost:3001'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET precisa ter ao menos 16 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /**
   * Janela em que reapresentar um refresh token já trocado é tratado como
   * corrida entre requisições (só 401), e não como roubo (derruba as sessões).
   */
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().min(0).default(30),
  /**
   * Segredo compartilhado com o frontend (BFF). Com ele, a API aceita o IP do
   * usuário final informado pelo BFF para aplicar o limite de requisições.
   */
  BFF_SHARED_SECRET: z.string().min(16).optional(),

  CORS_ORIGINS: z.string().default('*'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z
    .string()
    .default('ReciclaBairro <nao-responda@reciclabairro.local>'),

  PUSH_ENABLED: booleanFromString.default(false),

  LATE_TRIAGE_HOURS: z.coerce.number().positive().default(48),

  /**
   * Como e-mails e pushes saem:
   * - "interval": um job a cada 15 s envia a fila (servidor sempre ligado);
   * - "immediate": cada aviso é enviado logo após a ação que o gerou
   *   (hospedagem serverless, como a Vercel, onde não há processo contínuo).
   */
  NOTIFICATION_DISPATCH: z.enum(['interval', 'immediate']).default('interval'),
  /** Segredo das chamadas agendadas (Vercel Cron) para reenviar a fila. */
  CRON_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  return parsed.data;
}
