import { defineConfig } from 'vitest/config';

/** Banco usado SOMENTE pelos testes e2e (criado pelo docker compose). */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://reciclabairro:reciclabairro@localhost:5434/reciclabairro_test?schema=public';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'segredo-apenas-para-testes-e2e',
      APP_TIMEZONE: 'America/Sao_Paulo',
      SMTP_HOST: '',
      PUSH_ENABLED: 'false',
      // Sem tolerância: o teste de reuso de refresh token espera o comportamento estrito.
      REFRESH_REUSE_GRACE_SECONDS: '0',
      CRON_SECRET: 'segredo-do-cron-para-o-e2e',
    },
  },
});
