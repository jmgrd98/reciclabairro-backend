import { execSync } from 'node:child_process';
import pg from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://reciclabairro:reciclabairro@localhost:5434/reciclabairro_test?schema=public';

/**
 * Prepara o banco de testes: aplica as migrations e esvazia as tabelas.
 * Recusa-se a rodar se o banco não tiver "test" no nome, para nunca apagar
 * dados de desenvolvimento ou produção por engano.
 */
export default async function setup(): Promise<void> {
  const databaseName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!databaseName.includes('test')) {
    throw new Error(
      `Os testes e2e só rodam em um banco com "test" no nome (recebido: "${databaseName}").`,
    );
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}
