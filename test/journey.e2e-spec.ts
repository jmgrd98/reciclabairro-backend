/**
 * Teste de ponta a ponta das jornadas descritas no Projeto Integrador:
 * morador → cooperativa → coletor → conclusão, com notificações, histórico
 * e indicadores. Roda contra um PostgreSQL/PostGIS real (banco *_test).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { todayIn } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/client.js';
import {
  MailService,
  type MailMessage,
} from '../src/modules/mail/mail.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'senha-e2e-12345';
const TODAY = todayIn('America/Sao_Paulo');
// Centro da região de teste (Vila Mariana, São Paulo).
const HERE = { lat: -23.5891, lng: -46.6345 };

let app: INestApplication<App>;
let prisma: PrismaService;
const sentMails: MailMessage[] = [];

const api = () => request(app.getHttpServer());
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(email: string, password = PASSWORD): Promise<string> {
  const response = await api()
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return response.body.accessToken as string;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Condição não atingida a tempo');
}

async function notificationTypes(token: string): Promise<string[]> {
  const response = await api()
    .get('/api/v1/notifications?limit=100')
    .set(bearer(token))
    .expect(200);
  return (response.body.items as { type: string }[]).map((item) => item.type);
}

// Estado compartilhado entre as etapas da jornada.
const ids = {
  paper: '',
  glass: '',
  material: '',
  region: '',
  cooperative: '',
  collector: '',
  otherCollector: '',
  address: '',
  outsideAddress: '',
  pickup: '',
};
const tokens = {
  admin: '',
  manager: '',
  collector: '',
  otherCollector: '',
  resident: '',
  otherResident: '',
};
let residentRefreshToken = '';

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      send: async (message: MailMessage) => {
        sentMails.push(message);
      },
    })
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.create({
    data: {
      name: 'Admin de Teste',
      email: 'admin@teste.local',
      role: Role.ADMIN,
      passwordHash: await argon2.hash(PASSWORD),
      lgpdConsentAt: new Date(),
    },
  });
  tokens.admin = await login('admin@teste.local');
});

afterAll(async () => {
  await app.close();
});

describe('infraestrutura', () => {
  it('health check responde com o banco ok', async () => {
    const response = await api().get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('rota protegida sem token devolve 401 no formato padrão de erro', async () => {
    const response = await api().get('/api/v1/me').expect(401);
    expect(response.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Faça login para continuar.',
    });
  });
});

describe('admin prepara o catálogo', () => {
  it('cria categorias e um material do guia', async () => {
    const paper = await api()
      .post('/api/v1/admin/material-categories')
      .set(bearer(tokens.admin))
      .send({ name: 'Papel e papelão', color: '#1E88E5' })
      .expect(201);
    const glass = await api()
      .post('/api/v1/admin/material-categories')
      .set(bearer(tokens.admin))
      .send({ name: 'Vidro', color: '#43A047' })
      .expect(201);
    ids.paper = paper.body.id;
    ids.glass = glass.body.id;
    expect(paper.body.slug).toBe('papel-e-papelao');

    const material = await api()
      .post('/api/v1/admin/materials')
      .set(bearer(tokens.admin))
      .send({
        categoryId: ids.paper,
        name: 'Caixa de papelão',
        recyclable: true,
        preparation: 'Desmonte e mantenha seca.',
        synonyms: ['caixa'],
      })
      .expect(201);
    ids.material = material.body.id;
  });

  it('cria a região, o calendário, a cooperativa e a gestora', async () => {
    const region = await api()
      .post('/api/v1/admin/regions')
      .set(bearer(tokens.admin))
      .send({
        name: 'Vila Mariana',
        city: 'São Paulo',
        state: 'sp',
        neighborhoods: ['Vila Mariana'],
        centerLatitude: HERE.lat,
        centerLongitude: HERE.lng,
        radiusKm: 2,
      })
      .expect(201);
    ids.region = region.body.id;
    expect(region.body.state).toBe('SP');

    await api()
      .post('/api/v1/admin/schedules')
      .set(bearer(tokens.admin))
      .send({
        regionId: ids.region,
        weekday: 2,
        period: 'MANHA',
        categoryIds: [ids.paper, ids.glass],
      })
      .expect(201);

    const cooperative = await api()
      .post('/api/v1/admin/cooperatives')
      .set(bearer(tokens.admin))
      .send({ name: 'Cooperativa de Teste', regionIds: [ids.region] })
      .expect(201);
    ids.cooperative = cooperative.body.id;

    await api()
      .post(`/api/v1/admin/cooperatives/${ids.cooperative}/members`)
      .set(bearer(tokens.admin))
      .send({
        name: 'Marta Gestora',
        email: 'marta@teste.local',
        password: PASSWORD,
        memberRole: 'GESTOR',
      })
      .expect(201);
    tokens.manager = await login('marta@teste.local');
  });

  it('cria pontos de coleta a ~500 m, ~3 km e um só de vidro', async () => {
    const allWeek = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opensAt: '00:00',
      closesAt: '23:59',
    }));
    const base = {
      type: 'PEV',
      street: 'Rua de Teste',
      neighborhood: 'Vila Mariana',
      city: 'São Paulo',
      state: 'SP',
      longitude: HERE.lng,
      hours: allWeek,
    };
    const points = [
      {
        name: 'Ponto longe',
        latitude: HERE.lat - 0.027,
        categoryIds: [ids.paper],
      },
      {
        name: 'Ponto perto',
        latitude: HERE.lat - 0.0045,
        categoryIds: [ids.paper],
      },
      {
        name: 'Ponto de vidro',
        latitude: HERE.lat - 0.009,
        categoryIds: [ids.glass],
        hours: [],
      },
    ];
    for (const point of points) {
      await api()
        .post('/api/v1/collection-points')
        .set(bearer(tokens.admin))
        .send({ ...base, ...point })
        .expect(201);
    }
  });

  it('listagem de gestão: admin vê todos, gestora só os da cooperativa, morador nenhum', async () => {
    const all = await api()
      .get('/api/v1/collection-points/manage')
      .set(bearer(tokens.admin))
      .expect(200);
    expect(all.body.total).toBe(3);

    const own = await api()
      .post('/api/v1/collection-points')
      .set(bearer(tokens.manager))
      .send({
        name: 'Sede da cooperativa',
        type: 'COOPERATIVA',
        street: 'Rua de Teste',
        neighborhood: 'Vila Mariana',
        city: 'São Paulo',
        state: 'SP',
        latitude: HERE.lat - 0.05,
        longitude: HERE.lng,
        categoryIds: [ids.paper],
        hours: [],
      })
      .expect(201);
    expect(own.body.cooperative.id).toBe(ids.cooperative);

    const mine = await api()
      .get('/api/v1/collection-points/manage')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(
      (mine.body.items as { name: string }[]).map((item) => item.name),
    ).toEqual(['Sede da cooperativa']);

    // Desativado: some da busca pública, mas continua na listagem de gestão.
    await api()
      .delete(`/api/v1/collection-points/${own.body.id}`)
      .set(bearer(tokens.manager))
      .expect(204);
    const publicList = await api().get('/api/v1/collection-points').expect(200);
    expect(publicList.body.total).toBe(3);
    const afterDeactivation = await api()
      .get('/api/v1/collection-points/manage')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(afterDeactivation.body.items[0]).toMatchObject({
      name: 'Sede da cooperativa',
      active: false,
    });

    await api().get('/api/v1/collection-points/manage').expect(401);
  });

  it('gestora cadastra dois coletores', async () => {
    for (const [key, email] of [
      ['collector', 'carlos@teste.local'],
      ['otherCollector', 'ana@teste.local'],
    ] as const) {
      const response = await api()
        .post('/api/v1/cooperative/members')
        .set(bearer(tokens.manager))
        .send({ name: `Coletor ${key}`, email, password: PASSWORD })
        .expect(201);
      ids[key] = response.body.user.id;
      tokens[key] = await login(email);
    }
    const team = await api()
      .get('/api/v1/cooperative/members')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(team.body).toHaveLength(3);
  });
});

describe('cadastro e sessão do morador', () => {
  it('rejeita cadastro inválido com mensagens em português', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({
        name: 'J',
        email: 'nao-e-email',
        password: '123',
        acceptTerms: false,
        hack: 1,
      })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    const messages = (
      response.body.details as { messages: string[] }[]
    ).flatMap((detail) => detail.messages);
    expect(messages).toContain('A senha precisa ter ao menos 8 caracteres.');
    expect(messages).toContain('O campo "hack" não é aceito.');
  });

  it('não permite se cadastrar como admin', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({
        name: 'Esperto',
        email: 'x@teste.local',
        password: PASSWORD,
        acceptTerms: true,
        role: 'ADMIN',
      })
      .expect(400);
  });

  it('cadastra a moradora e um segundo morador', async () => {
    const juliana = await api()
      .post('/api/v1/auth/register')
      .send({
        name: 'Juliana Martins',
        email: 'Juliana@Teste.local',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    expect(juliana.body.user).toMatchObject({
      email: 'juliana@teste.local',
      role: 'MORADOR',
    });
    expect(juliana.body.user.passwordHash).toBeUndefined();
    tokens.resident = juliana.body.accessToken;
    residentRefreshToken = juliana.body.refreshToken;

    const other = await api()
      .post('/api/v1/auth/register')
      .send({
        name: 'Outro Morador',
        email: 'outro@teste.local',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    tokens.otherResident = other.body.accessToken;
  });

  it('e-mail repetido devolve 409 e senha errada devolve 401', async () => {
    const duplicate = await api()
      .post('/api/v1/auth/register')
      .send({
        name: 'Juliana',
        email: 'juliana@teste.local',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(409);
    expect(duplicate.body.code).toBe('EMAIL_IN_USE');

    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'juliana@teste.local', password: 'senha-errada' })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('refresh token é rotativo e o reuso derruba a sessão', async () => {
    const first = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: residentRefreshToken })
      .expect(200);
    expect(first.body.refreshToken).not.toBe(residentRefreshToken);

    // O token antigo já foi usado: reapresentá-lo é sinal de roubo.
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: residentRefreshToken })
      .expect(401);
    // …e por isso o token novo também deixa de valer.
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);

    tokens.resident = await login('juliana@teste.local');
  });

  it('morador não acessa rotas de admin nem de cooperativa', async () => {
    await api()
      .post('/api/v1/admin/regions')
      .set(bearer(tokens.resident))
      .send({})
      .expect(403);
    await api()
      .get('/api/v1/cooperative/pickup-requests')
      .set(bearer(tokens.resident))
      .expect(403);
  });
});

describe('orientação: guia, mapa e calendário (sem login)', () => {
  it('busca no guia ignora acentos e maiúsculas e o detalhe conta como uso', async () => {
    const search = await api()
      .get('/api/v1/materials?search=PAPELAO')
      .expect(200);
    expect(search.body.total).toBe(1);
    expect(search.body.items[0]).toMatchObject({
      name: 'Caixa de papelão',
      recyclable: true,
    });
    expect(search.body.items[0].searchText).toBeUndefined();

    const bySynonym = await api()
      .get('/api/v1/materials?search=caixa')
      .expect(200);
    expect(bySynonym.body.total).toBe(1);

    await api().get(`/api/v1/materials/${ids.material}`).expect(200);
    await api()
      .get(`/api/v1/materials/${ids.material}`)
      .set(bearer(tokens.resident))
      .expect(200);
    expect(await prisma.materialGuideView.count()).toBe(2);
  });

  it('pontos próximos vêm ordenados por distância real (PostGIS)', async () => {
    const response = await api()
      .get(`/api/v1/collection-points?lat=${HERE.lat}&lng=${HERE.lng}`)
      .expect(200);
    const names = (response.body.items as { name: string }[]).map(
      (item) => item.name,
    );
    expect(names).toEqual(['Ponto perto', 'Ponto de vidro', 'Ponto longe']);

    const [near, , far] = response.body.items as {
      distanceKm: number;
      openNow: boolean;
    }[];
    expect(near.distanceKm).toBeGreaterThan(0.45);
    expect(near.distanceKm).toBeLessThan(0.55);
    expect(far.distanceKm).toBeGreaterThan(2.9);
    expect(far.distanceKm).toBeLessThan(3.1);
    expect(near.openNow).toBe(true);
  });

  it('filtra por raio, por material aceito e por "aberto agora"', async () => {
    const within = await api()
      .get(
        `/api/v1/collection-points?lat=${HERE.lat}&lng=${HERE.lng}&radiusKm=1.5`,
      )
      .expect(200);
    expect(within.body.total).toBe(2);

    const glass = await api()
      .get(
        `/api/v1/collection-points?lat=${HERE.lat}&lng=${HERE.lng}&categoryId=${ids.glass}`,
      )
      .expect(200);
    expect(
      (glass.body.items as { name: string }[]).map((item) => item.name),
    ).toEqual(['Ponto de vidro']);

    const byMaterial = await api()
      .get(`/api/v1/collection-points?materialId=${ids.material}`)
      .expect(200);
    expect(byMaterial.body.total).toBe(2);

    const open = await api()
      .get('/api/v1/collection-points?openNow=true')
      .expect(200);
    expect(
      (open.body.items as { name: string }[]).map((item) => item.name),
    ).not.toContain('Ponto de vidro');

    await api().get('/api/v1/collection-points?radiusKm=2').expect(400);
  });

  it('calendário de coleta pelo local do usuário', async () => {
    const response = await api()
      .get(`/api/v1/schedule?lat=${HERE.lat}&lng=${HERE.lng}`)
      .expect(200);
    expect(response.body.region.name).toBe('Vila Mariana');
    expect(response.body.weekly).toHaveLength(1);
    expect(response.body.weekly[0]).toMatchObject({
      weekday: 2,
      period: 'MANHA',
    });
    expect(response.body.weekly[0].categories).toHaveLength(2);

    await api().get('/api/v1/schedule?lat=-10&lng=-50').expect(404);
  });
});

describe('solicitação de retirada', () => {
  const address = {
    zipCode: '04016-032',
    street: 'Rua França Pinto',
    number: '500',
    city: 'São Paulo',
    state: 'SP',
  };

  it('endereço dentro da região é associado a ela; fora, fica sem região', async () => {
    const inside = await api()
      .post('/api/v1/me/addresses')
      .set(bearer(tokens.resident))
      .send({
        ...address,
        neighborhood: 'Vila Mariana',
        latitude: -23.5876,
        longitude: -46.6412,
      })
      .expect(201);
    ids.address = inside.body.id;
    expect(inside.body.region).toMatchObject({ id: ids.region });
    expect(inside.body.isPrimary).toBe(true);

    const outside = await api()
      .post('/api/v1/me/addresses')
      .set(bearer(tokens.resident))
      .send({
        ...address,
        neighborhood: 'Centro',
        city: 'Campinas',
        latitude: -22.9,
        longitude: -47.06,
      })
      .expect(201);
    ids.outsideAddress = outside.body.id;
    expect(outside.body.region).toBeNull();
  });

  it('cria o pedido com protocolo e status SOLICITADA', async () => {
    const response = await api()
      .post('/api/v1/pickup-requests')
      .set(bearer(tokens.resident))
      .send({
        addressId: ids.address,
        items: [{ categoryId: ids.paper, quantity: 3, unit: 'SACOS' }],
        preferredDate: TODAY,
        preferredPeriod: 'MANHA',
        notes: 'Portão azul',
      })
      .expect(201);
    ids.pickup = response.body.id;
    expect(response.body.protocol).toMatch(/^RB-\d{4}-\d{6}$/);
    expect(response.body.status).toBe('SOLICITADA');
    expect(response.body.preferredDate).toBe(TODAY);
    expect(response.body.addressText).toContain('Rua França Pinto, 500');
    expect(response.body.late).toBe(false);
    expect(response.body.history).toHaveLength(1);
  });

  it('endereço fora de região atendida devolve 422', async () => {
    const response = await api()
      .post('/api/v1/pickup-requests')
      .set(bearer(tokens.resident))
      .send({
        addressId: ids.outsideAddress,
        items: [{ categoryId: ids.paper, quantity: 1, unit: 'KG' }],
      })
      .expect(422);
    expect(response.body.code).toBe('REGION_NOT_SERVED');
  });

  it('pedido sem materiais, com data passada ou com endereço alheio é rejeitado', async () => {
    await api()
      .post('/api/v1/pickup-requests')
      .set(bearer(tokens.resident))
      .send({ addressId: ids.address, items: [] })
      .expect(400);
    const past = await api()
      .post('/api/v1/pickup-requests')
      .set(bearer(tokens.resident))
      .send({
        addressId: ids.address,
        items: [{ categoryId: ids.paper, quantity: 1, unit: 'KG' }],
        preferredDate: '2020-01-01',
      })
      .expect(422);
    expect(past.body.code).toBe('INVALID_DATE');
    await api()
      .post('/api/v1/pickup-requests')
      .set(bearer(tokens.otherResident))
      .send({
        addressId: ids.address,
        items: [{ categoryId: ids.paper, quantity: 1, unit: 'KG' }],
      })
      .expect(404);
  });

  it('outro morador não vê nem cancela o pedido (403)', async () => {
    const view = await api()
      .get(`/api/v1/pickup-requests/${ids.pickup}`)
      .set(bearer(tokens.otherResident))
      .expect(403);
    expect(view.body.code).toBe('NOT_YOUR_REQUEST');
    await api()
      .post(`/api/v1/pickup-requests/${ids.pickup}/cancel`)
      .set(bearer(tokens.otherResident))
      .send({})
      .expect(403);
  });
});

describe('cooperativa: triagem, agendamento e distribuição', () => {
  const base = () => `/api/v1/cooperative/pickup-requests/${ids.pickup}`;

  it('o pedido novo aparece na fila, com os filtros funcionando', async () => {
    const queue = await api()
      .get('/api/v1/cooperative/pickup-requests?status=SOLICITADA')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(queue.body.total).toBe(1);
    expect(queue.body.items[0].requester.name).toBe('Juliana Martins');

    const byMaterial = await api()
      .get(
        `/api/v1/cooperative/pickup-requests?materialCategoryId=${ids.glass}`,
      )
      .set(bearer(tokens.manager))
      .expect(200);
    expect(byMaterial.body.total).toBe(0);

    const byDate = await api()
      .get(
        `/api/v1/cooperative/pickup-requests?regionId=${ids.region}&from=${TODAY}&to=${TODAY}`,
      )
      .set(bearer(tokens.manager))
      .expect(200);
    expect(byDate.body.total).toBe(1);
  });

  it('agendar antes de analisar é uma transição inválida (409)', async () => {
    const response = await api()
      .post(`${base()}/schedule`)
      .set(bearer(tokens.manager))
      .send({ scheduledDate: TODAY })
      .expect(409);
    expect(response.body.code).toBe('INVALID_TRANSITION');
  });

  it('gestora assume o pedido; assumir de novo dá 409', async () => {
    const response = await api()
      .post(`${base()}/start-review`)
      .set(bearer(tokens.manager))
      .expect(200);
    expect(response.body.status).toBe('EM_ANALISE');
    expect(response.body.cooperative.id).toBe(ids.cooperative);
    await api()
      .post(`${base()}/start-review`)
      .set(bearer(tokens.manager))
      .expect(409);
  });

  it('recusar sem motivo é rejeitado (400)', async () => {
    const response = await api()
      .post(`${base()}/refuse`)
      .set(bearer(tokens.manager))
      .send({})
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('confirma com data e coletor; data passada e coletor de fora são rejeitados', async () => {
    await api()
      .post(`${base()}/schedule`)
      .set(bearer(tokens.manager))
      .send({ scheduledDate: '2020-01-01' })
      .expect(422);
    const badCollector = await api()
      .post(`${base()}/schedule`)
      .set(bearer(tokens.manager))
      .send({ scheduledDate: TODAY, collectorId: ids.pickup })
      .expect(422);
    expect(badCollector.body.code).toBe('INVALID_COLLECTOR');

    const response = await api()
      .post(`${base()}/schedule`)
      .set(bearer(tokens.manager))
      .send({ scheduledDate: TODAY, collectorId: ids.collector })
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'AGENDADA',
      scheduledDate: TODAY,
      scheduledPeriod: 'MANHA',
    });
    expect(response.body.collector.id).toBe(ids.collector);
    expect(response.body.confirmedAt).not.toBeNull();
  });

  it('reagendar exige um recado ao solicitante', async () => {
    const response = await api()
      .post(`${base()}/schedule`)
      .set(bearer(tokens.manager))
      .send({ scheduledDate: TODAY })
      .expect(400);
    expect(response.body.code).toBe('COMMENT_REQUIRED');
  });
});

describe('coletor: execução e encerramento', () => {
  const base = () => `/api/v1/collector/pickups/${ids.pickup}`;

  it('a coleta aparece só para o coletor atribuído', async () => {
    const mine = await api()
      .get('/api/v1/collector/pickups')
      .set(bearer(tokens.collector))
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].addressText).toContain('Rua França Pinto');

    const others = await api()
      .get('/api/v1/collector/pickups')
      .set(bearer(tokens.otherCollector))
      .expect(200);
    expect(others.body).toHaveLength(0);
  });

  it('outro coletor não pode iniciar a rota (403)', async () => {
    const response = await api()
      .post(`${base()}/start-route`)
      .set(bearer(tokens.otherCollector))
      .expect(403);
    expect(response.body.code).toBe('NOT_ASSIGNED_TO_YOU');
  });

  it('coletor atribuído marca "em rota"', async () => {
    const response = await api()
      .post(`${base()}/start-route`)
      .set(bearer(tokens.collector))
      .expect(200);
    expect(response.body.status).toBe('EM_ROTA');
  });

  it('com a coleta em rota, o morador não pode mais cancelar (403)', async () => {
    const response = await api()
      .post(`/api/v1/pickup-requests/${ids.pickup}/cancel`)
      .set(bearer(tokens.resident))
      .send({})
      .expect(403);
    expect(response.body.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('conclusão exige os materiais recolhidos', async () => {
    await api()
      .post(`${base()}/complete`)
      .set(bearer(tokens.collector))
      .send({ collectedItems: [] })
      .expect(400);
  });

  it('conclui registrando materiais e observação', async () => {
    const response = await api()
      .post(`${base()}/complete`)
      .set(bearer(tokens.collector))
      .send({
        collectedItems: [{ categoryId: ids.paper, quantity: 3, unit: 'SACOS' }],
        notes: 'Tudo separado corretamente.',
      })
      .expect(200);
    expect(response.body.status).toBe('CONCLUIDA');
    expect(response.body.completedAt).not.toBeNull();

    // Depois de concluída, nada mais muda.
    await api()
      .post(`${base()}/complete`)
      .set(bearer(tokens.collector))
      .send({
        collectedItems: [{ categoryId: ids.paper, quantity: 1, unit: 'KG' }],
      })
      .expect(409);
  });
});

describe('acompanhamento, notificações e indicadores', () => {
  it('morador vê CONCLUIDA com a linha do tempo completa', async () => {
    const response = await api()
      .get(`/api/v1/pickup-requests/${ids.pickup}`)
      .set(bearer(tokens.resident))
      .expect(200);
    expect(response.body.status).toBe('CONCLUIDA');
    expect(
      (response.body.history as { kind: string }[]).map((item) => item.kind),
    ).toEqual([
      'CREATED',
      'REVIEW_STARTED',
      'SCHEDULED',
      'ROUTE_STARTED',
      'COMPLETED',
    ]);
    expect(response.body.collectedItems).toHaveLength(1);
    expect(response.body.collectedItems[0]).toMatchObject({
      quantity: 3,
      unit: 'SACOS',
    });
    expect(response.body.completionNotes).toBe('Tudo separado corretamente.');

    const history = await api()
      .get('/api/v1/pickup-requests?open=false')
      .set(bearer(tokens.resident))
      .expect(200);
    expect(history.body.total).toBe(1);
  });

  it('cada etapa gerou uma notificação para o morador', async () => {
    await waitFor(
      async () => (await notificationTypes(tokens.resident)).length >= 5,
    );
    expect((await notificationTypes(tokens.resident)).sort()).toEqual(
      [
        'PICKUP_CREATED',
        'PICKUP_REVIEW_STARTED',
        'PICKUP_SCHEDULED',
        'PICKUP_ROUTE_STARTED',
        'PICKUP_COMPLETED',
      ].sort(),
    );
    expect(await notificationTypes(tokens.manager)).toEqual(
      expect.arrayContaining(['PICKUP_CREATED', 'PICKUP_COMPLETED']),
    );
    expect(await notificationTypes(tokens.collector)).toContain(
      'PICKUP_SCHEDULED',
    );
    // Ninguém é avisado da própria ação.
    expect(await notificationTypes(tokens.collector)).not.toContain(
      'PICKUP_COMPLETED',
    );
  });

  it('marcar como lida e a contagem de não lidas', async () => {
    const list = await api()
      .get('/api/v1/notifications')
      .set(bearer(tokens.resident))
      .expect(200);
    expect(list.body.unreadCount).toBe(5);

    await api()
      .post(`/api/v1/notifications/${list.body.items[0].id}/read`)
      .set(bearer(tokens.resident))
      .expect(204);
    const unread = await api()
      .get('/api/v1/notifications?unread=true')
      .set(bearer(tokens.resident))
      .expect(200);
    expect(unread.body.total).toBe(4);

    // Não dá para marcar a notificação de outra pessoa.
    await api()
      .post(`/api/v1/notifications/${list.body.items[1].id}/read`)
      .set(bearer(tokens.otherResident))
      .expect(404);

    await api()
      .post('/api/v1/notifications/read-all')
      .set(bearer(tokens.resident))
      .expect(204);
    const after = await api()
      .get('/api/v1/notifications')
      .set(bearer(tokens.resident))
      .expect(200);
    expect(after.body.unreadCount).toBe(0);
  });

  it('a fila de envio manda os e-mails dos eventos principais', async () => {
    sentMails.length = 0;
    const sent = await app.get(NotificationsService).dispatchPending();
    expect(sent).toBe(3);
    expect(sentMails.map((mail) => mail.subject).sort()).toEqual([
      'ReciclaBairro — Coleta agendada',
      'ReciclaBairro — Coleta concluída',
      'ReciclaBairro — Solicitação recebida',
    ]);
    expect(sentMails.every((mail) => mail.to === 'juliana@teste.local')).toBe(
      true,
    );
    // Nada fica pendente para ser reenviado.
    expect(await app.get(NotificationsService).dispatchPending()).toBe(0);
  });

  it('dois envios simultâneos da fila não mandam o mesmo e-mail duas vezes', async () => {
    const notifications = app.get(NotificationsService);
    const recipient = await prisma.user.findUniqueOrThrow({
      where: { email: 'juliana@teste.local' },
    });
    await notifications.notify([
      {
        userIds: [recipient.id],
        type: 'TESTE',
        title: 'Aviso de teste',
        body: 'Corpo',
        email: true,
        data: {},
      },
    ]);
    sentMails.length = 0;
    const queued = await prisma.notificationDelivery.findMany({
      where: { status: 'PENDENTE', channel: 'EMAIL' },
      select: { id: true },
    });
    expect(queued).toHaveLength(1);
    const ids = queued.map((item) => item.id);
    // Imediato (por id) e periódico (geral) ao mesmo tempo.
    const [a, b] = await Promise.all([
      notifications.dispatchPending(50, ids),
      notifications.dispatchPending(50, ids),
    ]);
    expect(a + b).toBe(1);
    expect(sentMails).toHaveLength(1);
  });

  it('rota do cron exige o segredo e esvazia a fila', async () => {
    await api().get('/api/v1/internal/cron/dispatch-notifications').expect(401);
    await api()
      .get('/api/v1/internal/cron/dispatch-notifications')
      .set('Authorization', 'Bearer errado')
      .expect(401);
    const response = await api()
      .get('/api/v1/internal/cron/dispatch-notifications')
      .set('Authorization', 'Bearer segredo-do-cron-para-o-e2e')
      .expect(200);
    expect(response.body).toEqual({ ok: true, sent: 0 });
  });

  it('indicadores da cooperativa refletem o atendimento', async () => {
    const response = await api()
      .get('/api/v1/cooperative/dashboard')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(response.body.requests).toMatchObject({
      total: 1,
      concluded: 1,
      notConcluded: 0,
      open: 0,
      lateNow: 0,
      completionRate: 100,
    });
    expect(response.body.requests.byStatus.CONCLUIDA).toBe(1);
    expect(response.body.byRegion).toEqual([
      {
        regionId: ids.region,
        regionName: 'Vila Mariana',
        total: 1,
        concluded: 1,
        open: 0,
      },
    ]);
    expect(response.body.collectedMaterials).toEqual([
      {
        categoryId: ids.paper,
        categoryName: 'Papel e papelão',
        unit: 'SACOS',
        quantity: 3,
      },
    ]);
    expect(
      response.body.averageHours.requestToCompletion,
    ).toBeGreaterThanOrEqual(0);
    expect(response.body.materialGuide).toBeUndefined();
  });

  it('indicadores gerais incluem o uso do guia; moradores não têm acesso', async () => {
    const response = await api()
      .get('/api/v1/admin/dashboard')
      .set(bearer(tokens.admin))
      .expect(200);
    expect(response.body.materialGuide.views).toBe(2);
    expect(response.body.materialGuide.topMaterials[0]).toMatchObject({
      name: 'Caixa de papelão',
      views: 2,
    });
    await api()
      .get('/api/v1/admin/dashboard')
      .set(bearer(tokens.resident))
      .expect(403);
  });
});

describe('recusa, cancelamento, coleta não realizada e atraso', () => {
  async function newPickup(): Promise<string> {
    const response = await api()
      .post('/api/v1/pickup-requests')
      .set(bearer(tokens.resident))
      .send({
        addressId: ids.address,
        items: [{ categoryId: ids.paper, quantity: 1, unit: 'CAIXAS' }],
      })
      .expect(201);
    return response.body.id as string;
  }

  it('recusa com motivo chega ao morador', async () => {
    const id = await newPickup();
    await api()
      .post(`/api/v1/cooperative/pickup-requests/${id}/start-review`)
      .set(bearer(tokens.manager))
      .expect(200);
    const refused = await api()
      .post(`/api/v1/cooperative/pickup-requests/${id}/refuse`)
      .set(bearer(tokens.manager))
      .send({ reason: 'Volume acima da capacidade desta semana.' })
      .expect(200);
    expect(refused.body).toMatchObject({
      status: 'RECUSADA',
      closingReason: 'Volume acima da capacidade desta semana.',
    });

    await waitFor(async () =>
      (await notificationTypes(tokens.resident)).includes('PICKUP_REFUSED'),
    );
    const list = await api()
      .get('/api/v1/notifications?unread=true')
      .set(bearer(tokens.resident))
      .expect(200);
    const notice = (list.body.items as { type: string; body: string }[]).find(
      (item) => item.type === 'PICKUP_REFUSED',
    );
    expect(notice?.body).toContain('Volume acima da capacidade');
  });

  it('morador cancela enquanto o pedido está aberto', async () => {
    const id = await newPickup();
    const cancelled = await api()
      .post(`/api/v1/pickup-requests/${id}/cancel`)
      .set(bearer(tokens.resident))
      .send({ reason: 'Vou levar ao ponto de entrega.' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELADA');
    // Cancelado antes da triagem: some da fila da cooperativa.
    const queue = await api()
      .get('/api/v1/cooperative/pickup-requests?status=CANCELADA')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(queue.body.total).toBe(0);
  });

  it('coleta não realizada volta para AGENDADA e pode ser reagendada com recado', async () => {
    const id = await newPickup();
    const coop = `/api/v1/cooperative/pickup-requests/${id}`;
    await api()
      .post(`${coop}/start-review`)
      .set(bearer(tokens.manager))
      .expect(200);
    await api()
      .post(`${coop}/schedule`)
      .set(bearer(tokens.manager))
      .send({ scheduledDate: TODAY })
      .expect(200);
    await api()
      .post(`${coop}/assign`)
      .set(bearer(tokens.manager))
      .send({ collectorId: ids.otherCollector })
      .expect(200);
    await api()
      .post(`/api/v1/collector/pickups/${id}/start-route`)
      .set(bearer(tokens.otherCollector))
      .expect(200);

    await api()
      .post(`/api/v1/collector/pickups/${id}/not-collected`)
      .set(bearer(tokens.otherCollector))
      .send({})
      .expect(400);
    const back = await api()
      .post(`/api/v1/collector/pickups/${id}/not-collected`)
      .set(bearer(tokens.otherCollector))
      .send({ reason: 'Ninguém atendeu no endereço.' })
      .expect(200);
    expect(back.body.status).toBe('AGENDADA');

    const rescheduled = await api()
      .post(`${coop}/schedule`)
      .set(bearer(tokens.manager))
      .send({
        scheduledDate: TODAY,
        scheduledPeriod: 'TARDE',
        comment: 'Voltaremos à tarde.',
      })
      .expect(200);
    expect(rescheduled.body.scheduledPeriod).toBe('TARDE');
    expect(
      (rescheduled.body.history as { kind: string }[]).map((item) => item.kind),
    ).toEqual([
      'CREATED',
      'REVIEW_STARTED',
      'SCHEDULED',
      'ASSIGNED',
      'ROUTE_STARTED',
      'NOT_COLLECTED',
      'RESCHEDULED',
    ]);

    const cancelled = await api()
      .post(`${coop}/cancel`)
      .set(bearer(tokens.manager))
      .send({ reason: 'Solicitante pediu por telefone.' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELADA');
  });

  it('pedido sem triagem há mais de 48 h aparece como atrasado', async () => {
    const id = await newPickup();
    await prisma.pickupRequest.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 72 * 3_600_000) },
    });
    const late = await api()
      .get('/api/v1/cooperative/pickup-requests?late=true')
      .set(bearer(tokens.manager))
      .expect(200);
    expect(late.body.total).toBe(1);
    expect(late.body.items[0]).toMatchObject({ id, late: true });

    const dashboard = await api()
      .get('/api/v1/cooperative/dashboard')
      .set(bearer(tokens.manager))
      .expect(200);
    // O pedido ainda não foi assumido por nenhuma cooperativa, então não entra nos números dela…
    expect(dashboard.body.requests.lateNow).toBe(0);
    // …mas entra na visão geral da plataforma.
    const admin = await api()
      .get('/api/v1/admin/dashboard')
      .set(bearer(tokens.admin))
      .expect(200);
    expect(admin.body.requests.lateNow).toBe(1);
    expect(admin.body.requests).toMatchObject({
      total: 5,
      concluded: 1,
      cancelled: 2,
      refused: 1,
      open: 1,
    });
  });
});

describe('recuperação de senha e exclusão de conta (LGPD)', () => {
  it('redefine a senha com o código enviado por e-mail', async () => {
    sentMails.length = 0;
    await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'outro@teste.local' })
      .expect(204);
    // E-mail inexistente responde igual, sem enviar nada.
    await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ninguem@teste.local' })
      .expect(204);
    expect(sentMails).toHaveLength(1);
    const token = /[a-f0-9]{64}/.exec(sentMails[0].text)?.[0];
    expect(token).toBeDefined();

    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'nova-senha-e2e-1' })
      .expect(204);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: 'outro@teste.local', password: PASSWORD })
      .expect(401);
    await login('outro@teste.local', 'nova-senha-e2e-1');
    // O código só vale uma vez.
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'outra-senha-e2e-2' })
      .expect(400);
  });

  it('excluir a conta anonimiza os dados e mantém os pedidos sem endereço', async () => {
    const me = await api()
      .get('/api/v1/me')
      .set(bearer(tokens.resident))
      .expect(200);
    const userId = me.body.id as string;

    await api().delete('/api/v1/me').set(bearer(tokens.resident)).expect(204);

    await api()
      .post('/api/v1/auth/login')
      .send({ email: 'juliana@teste.local', password: PASSWORD })
      .expect(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      name: 'Usuário removido',
      active: false,
      phone: null,
    });
    expect(user.email).not.toContain('juliana');
    expect(await prisma.address.count({ where: { userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);

    const requests = await prisma.pickupRequest.findMany({
      where: { requesterId: userId },
    });
    expect(requests).toHaveLength(5);
    expect(
      requests.every((item) => item.addressText === 'Endereço removido'),
    ).toBe(true);
    // O pedido que ainda estava aberto foi cancelado.
    expect(
      requests.filter((item) => item.status === 'SOLICITADA'),
    ).toHaveLength(0);
  });

  it('contas de equipe não podem se autoexcluir', async () => {
    const response = await api()
      .delete('/api/v1/me')
      .set(bearer(tokens.collector))
      .expect(403);
    expect(response.body.code).toBe('STAFF_ACCOUNT');
  });
});
