// Função da Vercel: repassa toda requisição para a API Nest já compilada
// (`npm run build` gera dist/). O código-fonte fica em src/serverless.ts.
import { getHandler } from '../dist/serverless.js';

export default async function handler(req, res) {
  const app = await getHandler();
  return app(req, res);
}
