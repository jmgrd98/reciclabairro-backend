# AGENTS.md

Notas para quem (pessoa ou assistente de código) for alterar este projeto. O `README.md` tem a visão geral.

## Versões

Este projeto usa NestJS 12 e Prisma 7, que mudaram bastante em relação às versões anteriores. Na dúvida, consulte a documentação em vez de confiar na memória: https://docs.nestjs.com/llms.txt (índice com uma página markdown por capítulo).

- O projeto é **ESM**: imports relativos terminam em `.js`, `__dirname` não existe (use `import.meta.dirname`).
- Testes rodam no **Vitest** (`vi.fn()`, não `jest.fn()`).
- Lint é **oxlint** (`npm run lint`), não ESLint.
- Prisma: gerador `prisma-client` com saída em `src/generated/prisma` (importar de `…/generated/prisma/client.js`), adaptador `@prisma/adapter-pg`, configuração em `prisma7.config.ts`. Mantenha `prisma` e `@prisma/client` na versão 7.

## Convenções

- Um módulo Nest por domínio em `src/modules/`. DTOs em arquivos `*.dto.ts` com `class-validator` (o plugin do Swagger gera a documentação a partir deles).
- Erros de regra de negócio: `AppException` com `code` estável e `message` em português simples.
- Rotas são protegidas por padrão; use `@Public()` para liberar e `@Roles(...)` para restringir. Além do papel, confira sempre a posse do recurso no service.
- Mudanças de status de solicitação só por `PickupRequestsService.applyTransition`. Para uma transição nova, altere `pickup-state-machine.ts` e o teste que percorre todas as combinações.
- Depois de alterar `prisma/schema.prisma`: `npx prisma migrate dev --name <nome>` e `npx prisma generate`.

## Antes de entregar

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```

O e2e precisa do banco no ar (`docker compose up -d db`).
