import { timingSafeEqual } from 'node:crypto';

export const BFF_SECRET_HEADER = 'x-bff-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

function sameSecret(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Quem conta para o limite de requisições. O navegador nunca chama a API
 * direto: tudo passa pelo frontend (BFF), então o IP da conexão é sempre o do
 * servidor do frontend. Quando a chamada prova que veio do BFF (segredo
 * compartilhado), usamos o IP do usuário final informado por ele; em qualquer
 * outro caso, o IP da conexão — assim ninguém de fora consegue forjar o IP.
 */
export function resolveTracker(
  headers: Record<string, string | string[] | undefined>,
  connectionIp: string,
  secret: string | undefined,
): string {
  const provided = headers[BFF_SECRET_HEADER];
  const clientIp = headers[CLIENT_IP_HEADER];
  if (
    secret &&
    typeof provided === 'string' &&
    typeof clientIp === 'string' &&
    clientIp.length > 0 &&
    clientIp.length <= 64 &&
    sameSecret(secret, provided)
  ) {
    return clientIp;
  }
  return connectionIp;
}
