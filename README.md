# ReciclaBairro — Backend

API REST do **ReciclaBairro** (Projeto Integrador SENAC — ADS, Grupo 43): plataforma que conecta moradores, comerciantes, cooperativas e coletores para o descarte correto de recicláveis. Esta API atende tanto o app web quanto o mobile.

**Stack:** Node 24 · NestJS 12 (TypeScript, ESM) · Prisma 7 · PostgreSQL 17 + PostGIS · Vitest · Docker.

## O que a V1 entrega

| Requisito do projeto | Onde está na API |
|---|---|
| Cadastro e autenticação | `/auth/*`, `/me` |
| Guia de materiais recicláveis | `/material-categories`, `/materials` |
| Mapa de pontos de entrega (proximidade, material, horário) | `/collection-points` (gestão: `/collection-points/manage`) |
| Calendário de coleta | `/regions/:id/schedule`, `/schedule` |
| Solicitação de retirada com protocolo | `/pickup-requests` |
| Painel de acompanhamento (morador e cooperativa) | `/pickup-requests`, `/cooperative/pickup-requests` |
| Execução pelo coletor e registro de materiais recolhidos | `/collector/pickups` |
| Notificações (app, e-mail, push) | `/notifications` |
| Histórico | `/pickup-requests?open=false` |
| Indicadores (seção 5.4 do documento) | `/cooperative/dashboard`, `/admin/dashboard` |

A lista completa de rotas, com campos e exemplos, fica no Swagger: **http://localhost:3000/docs**.

## Como rodar

Pré-requisitos: Node 24+ e Docker.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
docker compose up -d db mailpit
```

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

```bash
npm run start:dev
```

- API: http://localhost:3000/api/v1
- Documentação (Swagger): http://localhost:3000/docs
- Caixa de e-mails de teste (Mailpit): http://localhost:8025
- Banco: `localhost:5434` (usuário, senha e banco: `reciclabairro`)

Para rodar tudo em contêineres, sem Node instalado: `docker compose --profile api up -d --build`.

> Em Macs Apple Silicon o PostGIS roda emulado (a imagem oficial só existe para amd64). Funciona, só demora um pouco mais para subir.

### Contas de demonstração

O seed cria dados **fictícios** (região Vila Mariana/SP, uma cooperativa, 10 pontos de coleta, 32 materiais no guia). A senha de todas as contas é a variável `SEED_PASSWORD` do seu `.env`.

| E-mail | Papel |
|---|---|
| `juliana@reciclabairro.local` | Moradora |
| `roberto@reciclabairro.local` | Comerciante |
| `marta@reciclabairro.local` | Gestora da cooperativa |
| `carlos@reciclabairro.local`, `ana@reciclabairro.local` | Coletores |
| `patricia@reciclabairro.local` | Educadora ambiental |
| `admin@reciclabairro.local` | Administrador |

## Fluxo da solicitação de retirada

```
SOLICITADA ──▶ EM_ANALISE ──▶ AGENDADA ──▶ EM_ROTA ──▶ CONCLUIDA
     │              │             │           │
     │              └──▶ RECUSADA │           └──▶ AGENDADA (coleta não realizada)
     └──────────────┴─────────────┴──▶ CANCELADA
```

| Passo | Quem | Rota |
|---|---|---|
| Solicitar | Morador / comerciante | `POST /pickup-requests` |
| Assumir e analisar | Gestor | `POST /cooperative/pickup-requests/:id/start-review` |
| Confirmar com data (ou reagendar) | Gestor | `POST …/:id/schedule` |
| Distribuir a um coletor | Gestor | `POST …/:id/assign` |
| Recusar (motivo obrigatório) | Gestor | `POST …/:id/refuse` |
| Marcar em rota (só no dia agendado) | Coletor ou gestor | `POST /collector/pickups/:id/start-route` |
| Concluir com materiais recolhidos | Coletor ou gestor | `POST /collector/pickups/:id/complete` |
| Registrar "não realizada" | Coletor ou gestor | `POST /collector/pickups/:id/not-collected` |
| Cancelar | Solicitante (até AGENDADA) ou gestor (com motivo) | `POST …/:id/cancel` |

Decisões que o documento do projeto deixava em aberto:

- **Recusa** é um status próprio (`RECUSADA`), diferente de `CANCELADA`.
- **Atrasada** não é status: é calculada (sem agendamento após `LATE_TRIAGE_HOURS`, 48 h por padrão, ou data agendada vencida). Aparece como `late: true` e no filtro `?late=true`.
- **Quem recebe o pedido:** ele fica visível para as cooperativas que atendem a região do endereço; a primeira que iniciar a análise assume.
- **Região do endereço:** definida pelo bairro ou, na falta dele, pela distância até o centro da região. Endereço fora de região atendida não pode pedir retirada (erro `REGION_NOT_SERVED`), mas continua usando guia, mapa e calendário.

## Convenções da API

- Prefixo `/api/v1`. Autenticação por `Authorization: Bearer <accessToken>`; o `refreshToken` é trocado em `POST /auth/refresh` (rotativo).
- Listas paginadas: `?page=1&limit=20` → `{ items, page, limit, total, totalPages }`.
- Datas "só dia" trafegam como `AAAA-MM-DD`, no fuso `APP_TIMEZONE`.
- Erros sempre no formato abaixo. Use `code` para tratar no app e `message` para mostrar ao usuário (já em português simples).

```json
{ "statusCode": 422, "code": "REGION_NOT_SERVED", "message": "Ainda não fazemos retiradas neste endereço. Veja no mapa os pontos de entrega mais próximos." }
```

## Integração com o frontend

O app web fica em [`reciclabairro-web`](../reciclabairro-web) (Next.js, porta 3001). O navegador não chama esta API direto: tudo passa pelo servidor do Next (BFF), que guarda os tokens em cookies `httpOnly`. Três pontos desta API existem por causa disso:

- **`BFF_SHARED_SECRET`** (mesmo valor nos dois projetos): como todas as chamadas chegam do IP do frontend, o limite de requisições usa o IP do usuário final informado pelo BFF — mas só quando a chamada apresenta esse segredo (`src/common/throttler.guard.ts` e `src/common/rate-limit.ts`). Sem o segredo, vale o IP da conexão.
- **`REFRESH_REUSE_GRACE_SECONDS`** (padrão 30): reapresentar um refresh token recém-trocado é tratado como corrida entre requisições (só 401). Depois desse prazo, é tratado como roubo e todas as sessões do usuário caem.
- **`APP_PUBLIC_URL`**: endereço do frontend, usado no link do e-mail de redefinição de senha (`/redefinir-senha?token=…`).

## Estrutura

```
src/
├─ main.ts, app.module.ts, app.setup.ts   # bootstrap e configuração HTTP
├─ config/env.ts                          # variáveis de ambiente validadas
├─ common/                                # guards, erros, paginação, datas, eventos
├─ prisma/                                # PrismaService
└─ modules/
   ├─ auth/  users/  mail/                # identidade
   ├─ regions/  materials/  collection-points/  schedules/   # catálogo público
   ├─ cooperatives/  pickup-requests/     # operação
   └─ notifications/  dashboard/  health/
prisma/   schema.prisma · migrations/ · seed.ts
test/     teste e2e da jornada completa
```

Pontos de atenção para quem for mexer no código:

- O projeto é **ESM**: imports relativos terminam em `.js` e os testes usam Vitest (`vi.fn()`).
- O cliente Prisma é gerado em `src/generated/prisma` (fora do git). Rode `npx prisma generate` depois de alterar o schema.
- Toda mudança de status passa por `PickupRequestsService.applyTransition`, que valida na máquina de estados (`pickup-state-machine.ts`), grava o histórico na mesma transação e emite o evento `pickup.changed`. As notificações escutam esse evento.
- E-mail e push são enfileirados na tabela `NotificationDelivery` e enviados por um job a cada 15 s.
- A coluna geográfica dos pontos de coleta é preenchida por um gatilho no banco (ver a migration inicial).

## Testes

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:e2e
```

- **Unitários** (`npm test`): máquina de estados (todas as combinações de status × ator), cálculo de atraso, datas com fuso, associação de endereço à região, mensagens de notificação.
- **E2E** (`npm run test:e2e`): a jornada completa do documento contra um PostgreSQL/PostGIS real — banco `reciclabairro_test`, criado pelo `docker compose` e esvaziado a cada execução. O setup se recusa a rodar em um banco sem "test" no nome.

## Produção

A API está publicada na **Vercel** (função serverless em São Paulo, `gru1`) com o banco no **Neon** (PostgreSQL 17 + PostGIS, também em São Paulo), criado pela integração da Vercel.

- **Endereço:** https://reciclabairro-api.vercel.app (documentação em `/docs`)
- **Deploy:** automático a cada push na `main` (projeto `reciclabairro-api` ligado a este repositório).
- **Como roda:** `api/index.mjs` repassa as requisições para a aplicação Nest já compilada por `npm run build` (`src/serverless.ts`). A Vercel não compila o TypeScript: assim os metadados dos decorators, de que a injeção de dependências do Nest precisa, ficam intactos.
- **E-mails:** com `NOTIFICATION_DISPATCH=immediate`, cada aviso sai logo após a ação que o gerou (`waitUntil`). Uma rotina diária (Vercel Cron, `vercel.json`) reenvia o que tiver falhado; no plano gratuito a Vercel só permite rotinas uma vez por dia.
- **Limite de requisições:** em memória, por instância (`src/common/rate-limit.ts`). Na Vercel cada instância conta à parte, então funciona como proteção contra abuso, não como cota exata.

### Variáveis de ambiente (projeto `reciclabairro-api` na Vercel)

| Variável | Valor |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Criadas pela integração do Neon (conexão com pool e direta) |
| `JWT_ACCESS_SECRET`, `CRON_SECRET` | Segredos aleatórios |
| `BFF_SHARED_SECRET` | Mesmo valor do projeto do frontend |
| `APP_PUBLIC_URL`, `CORS_ORIGINS` | `https://reciclabairro-web.vercel.app` |
| `NOTIFICATION_DISPATCH` | `immediate` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Provedor de e-mail |

### Migrations e seed no banco de produção

As migrations **não** rodam no deploy. Depois de criar uma migration nova:

```bash
vercel env pull .env.local --environment=production
```

```bash
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')" npx prisma migrate deploy
```

Use sempre a conexão **direta** (`DATABASE_URL_UNPOOLED`) para migrations; a com pool é para a aplicação.

### Outras formas de rodar

- `Dockerfile` multi-stage: imagem que aplica as migrations e sobe a API num servidor comum (aí o modo de e-mail padrão, `interval`, já serve).
- `.github/workflows/ci.yml`: lint, tipos, testes unitários, build e e2e a cada push.

## Próximas fases (fora da V1)

1. **Coleta recorrente** para comerciantes.
2. **Gamificação:** pontos creditados no evento de conclusão, ranking e desafios.
3. **Educação e campanhas** para educadores e órgãos públicos.
4. **Otimização de rotas** para os coletores.
5. **Tempo real** (posição do coletor) e integrações com sistemas públicos.
