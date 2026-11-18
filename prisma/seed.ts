/**
 * Dados de demonstração do ReciclaBairro.
 *
 * Tudo aqui é FICTÍCIO (pessoas, cooperativa, pontos de coleta e calendário),
 * criado só para o grupo conseguir navegar e apresentar o sistema.
 * Pode ser executado várias vezes: o que já existe é mantido.
 *
 *   npx prisma db seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import {
  CollectionPointType,
  MemberRole,
  Period,
  PrismaClient,
  Role,
} from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Recicla@123';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ───────────────────────── Categorias e guia ─────────────────────────
// Cores conforme o padrão brasileiro de coleta seletiva (CONAMA 275/2001).

const CATEGORIES = [
  {
    name: 'Papel e papelão',
    color: '#1E88E5',
    icon: 'paper',
    description: 'Lixeira azul.',
  },
  {
    name: 'Plástico',
    color: '#E53935',
    icon: 'plastic',
    description: 'Lixeira vermelha.',
  },
  {
    name: 'Vidro',
    color: '#43A047',
    icon: 'glass',
    description: 'Lixeira verde.',
  },
  {
    name: 'Metal',
    color: '#FDD835',
    icon: 'metal',
    description: 'Lixeira amarela.',
  },
  {
    name: 'Eletrônicos',
    color: '#8E24AA',
    icon: 'electronics',
    description: 'Entregar em pontos específicos; não vai na coleta comum.',
  },
  {
    name: 'Pilhas e baterias',
    color: '#FB8C00',
    icon: 'battery',
    description:
      'Resíduo perigoso (lixeira laranja); entregar em pontos específicos.',
  },
  {
    name: 'Óleo de cozinha',
    color: '#6D4C41',
    icon: 'oil',
    description: 'Nunca descartar na pia; entregar em garrafa fechada.',
  },
  {
    name: 'Não reciclável',
    color: '#757575',
    icon: 'trash',
    description: 'Vai para o lixo comum (lixeira cinza).',
  },
] as const;

type CategoryName = (typeof CATEGORIES)[number]['name'];

interface MaterialSeed {
  category: CategoryName;
  name: string;
  recyclable: boolean;
  preparation: string;
  notes?: string;
  synonyms?: string[];
}

const MATERIALS: MaterialSeed[] = [
  // Papel
  {
    category: 'Papel e papelão',
    name: 'Caixa de papelão',
    recyclable: true,
    preparation:
      'Desmonte e achate a caixa. Retire fitas adesivas em excesso e mantenha seca.',
    synonyms: ['papelao', 'caixa'],
  },
  {
    category: 'Papel e papelão',
    name: 'Jornais e revistas',
    recyclable: true,
    preparation:
      'Empilhe ou amarre. Não precisa retirar grampos. Mantenha seco.',
    synonyms: ['jornal', 'revista'],
  },
  {
    category: 'Papel e papelão',
    name: 'Papel de escritório',
    recyclable: true,
    preparation:
      'Junte as folhas sem amassar. Evite rasgar em pedaços muito pequenos.',
    synonyms: ['sulfite', 'folha', 'caderno'],
  },
  {
    category: 'Papel e papelão',
    name: 'Embalagem longa vida',
    recyclable: true,
    preparation: 'Enxágue, deixe escorrer e achate. Pode manter a tampinha.',
    notes: 'Também chamada de caixinha de leite ou suco.',
    synonyms: ['caixinha de leite', 'tetra pak', 'caixa de suco'],
  },
  {
    category: 'Papel e papelão',
    name: 'Caixa de pizza limpa',
    recyclable: true,
    preparation:
      'Só a parte sem gordura é reciclável. Rasgue e descarte no lixo comum a parte engordurada.',
    synonyms: ['pizza'],
  },
  // Plástico
  {
    category: 'Plástico',
    name: 'Garrafa PET',
    recyclable: true,
    preparation:
      'Esvazie, enxágue rapidamente e amasse. Pode recolocar a tampa.',
    synonyms: ['garrafa de refrigerante', 'pet', 'garrafa de agua'],
  },
  {
    category: 'Plástico',
    name: 'Embalagem de produto de limpeza',
    recyclable: true,
    preparation: 'Esvazie por completo e enxágue. Mantenha a tampa.',
    synonyms: ['detergente', 'amaciante', 'agua sanitaria', 'shampoo'],
  },
  {
    category: 'Plástico',
    name: 'Sacolas e sacos plásticos',
    recyclable: true,
    preparation: 'Junte várias sacolas limpas e secas dentro de uma só.',
    synonyms: ['sacola', 'saquinho'],
  },
  {
    category: 'Plástico',
    name: 'Potes de alimento',
    recyclable: true,
    preparation:
      'Retire os restos de comida e enxágue. Não precisa tirar o rótulo.',
    synonyms: ['pote de margarina', 'pote de sorvete', 'iogurte'],
  },
  {
    category: 'Plástico',
    name: 'Tampinhas plásticas',
    recyclable: true,
    preparation: 'Junte em um pote ou garrafa para não se perderem na triagem.',
    synonyms: ['tampa'],
  },
  {
    category: 'Plástico',
    name: 'Isopor',
    recyclable: true,
    preparation:
      'Limpe e separe. Nem toda cooperativa aceita: confirme no ponto de entrega.',
    notes: 'Tecnicamente reciclável (EPS), mas com pouca procura.',
    synonyms: ['eps', 'bandeja de isopor'],
  },
  // Vidro
  {
    category: 'Vidro',
    name: 'Garrafas de vidro',
    recyclable: true,
    preparation: 'Esvazie e enxágue. Entregue inteira sempre que possível.',
    synonyms: ['garrafa de cerveja', 'garrafa de vinho', 'long neck'],
  },
  {
    category: 'Vidro',
    name: 'Potes e frascos de vidro',
    recyclable: true,
    preparation:
      'Enxágue e retire a tampa (a tampa de metal vai com os metais).',
    synonyms: ['pote de conserva', 'frasco', 'pote de geleia'],
  },
  {
    category: 'Vidro',
    name: 'Vidro quebrado',
    recyclable: true,
    preparation:
      'Embrulhe em jornal ou coloque em caixa de papelão fechada e escreva "VIDRO QUEBRADO" para proteger quem coleta.',
    synonyms: ['caco de vidro', 'copo quebrado'],
  },
  // Metal
  {
    category: 'Metal',
    name: 'Lata de alumínio',
    recyclable: true,
    preparation: 'Esvazie, enxágue e amasse.',
    synonyms: ['latinha', 'lata de refrigerante', 'lata de cerveja'],
  },
  {
    category: 'Metal',
    name: 'Lata de aço',
    recyclable: true,
    preparation:
      'Enxágue e empurre a tampa para dentro da lata para evitar cortes.',
    synonyms: ['lata de conserva', 'lata de molho', 'lata de leite em po'],
  },
  {
    category: 'Metal',
    name: 'Tampas metálicas',
    recyclable: true,
    preparation: 'Junte em uma lata e amasse a boca para não se perderem.',
    synonyms: ['tampinha de garrafa', 'tampa de pote'],
  },
  {
    category: 'Metal',
    name: 'Papel-alumínio limpo',
    recyclable: true,
    preparation: 'Retire restos de comida e faça uma bola compacta.',
    synonyms: ['papel aluminio', 'marmita de aluminio'],
  },
  {
    category: 'Metal',
    name: 'Panelas e utensílios de metal',
    recyclable: true,
    preparation: 'Entregue sem cabos de plástico ou madeira, se possível.',
    synonyms: ['panela', 'frigideira', 'talheres'],
  },
  // Eletrônicos
  {
    category: 'Eletrônicos',
    name: 'Celulares e carregadores',
    recyclable: true,
    preparation:
      'Apague seus dados, retire o chip e entregue em um ponto de coleta de eletrônicos.',
    synonyms: ['celular', 'smartphone', 'carregador', 'cabo'],
  },
  {
    category: 'Eletrônicos',
    name: 'Computadores e periféricos',
    recyclable: true,
    preparation:
      'Apague seus dados e entregue em um ponto de coleta de eletrônicos. Não desmonte.',
    synonyms: ['notebook', 'teclado', 'mouse', 'monitor', 'impressora'],
  },
  {
    category: 'Eletrônicos',
    name: 'Eletrodomésticos pequenos',
    recyclable: true,
    preparation: 'Entregue inteiro em um ponto de coleta de eletrônicos.',
    synonyms: ['liquidificador', 'ferro de passar', 'secador', 'torradeira'],
  },
  {
    category: 'Eletrônicos',
    name: 'Lâmpadas fluorescentes',
    recyclable: true,
    preparation:
      'Não quebre. Embale na caixa original ou em jornal e leve a um ponto que aceite lâmpadas.',
    notes: 'Contêm mercúrio: nunca descarte no lixo comum.',
    synonyms: ['lampada', 'lampada fluorescente'],
  },
  // Pilhas
  {
    category: 'Pilhas e baterias',
    name: 'Pilhas comuns e alcalinas',
    recyclable: true,
    preparation:
      'Guarde em um pote fechado e entregue em um ponto de coleta de pilhas.',
    synonyms: ['pilha', 'pilha aa', 'pilha palito'],
  },
  {
    category: 'Pilhas e baterias',
    name: 'Baterias de celular e notebook',
    recyclable: true,
    preparation:
      'Proteja os contatos com fita adesiva e entregue em um ponto de coleta. Não fure nem amasse.',
    synonyms: ['bateria', 'bateria de litio'],
  },
  // Óleo
  {
    category: 'Óleo de cozinha',
    name: 'Óleo de cozinha usado',
    recyclable: true,
    preparation:
      'Deixe esfriar, coe e guarde em garrafa PET bem fechada. Entregue em um ponto que receba óleo.',
    notes:
      'Um litro de óleo na pia pode contaminar milhares de litros de água.',
    synonyms: ['oleo', 'oleo de fritura', 'gordura'],
  },
  // Não recicláveis
  {
    category: 'Não reciclável',
    name: 'Papel higiênico e guardanapos usados',
    recyclable: false,
    preparation: 'Descarte no lixo comum.',
    synonyms: [
      'papel higienico',
      'guardanapo',
      'papel toalha',
      'lenco de papel',
    ],
  },
  {
    category: 'Não reciclável',
    name: 'Espelhos e cerâmicas',
    recyclable: false,
    preparation:
      'Embrulhe bem para não ferir ninguém e descarte no lixo comum ou em um ecoponto de entulho.',
    notes: 'Não misture com vidro reciclável: a composição é diferente.',
    synonyms: ['espelho', 'louca', 'porcelana', 'prato quebrado', 'azulejo'],
  },
  {
    category: 'Não reciclável',
    name: 'Fraldas e absorventes',
    recyclable: false,
    preparation: 'Descarte no lixo comum.',
    synonyms: ['fralda', 'absorvente'],
  },
  {
    category: 'Não reciclável',
    name: 'Esponja de cozinha',
    recyclable: false,
    preparation: 'Descarte no lixo comum.',
    synonyms: ['bucha', 'esponja'],
  },
  {
    category: 'Não reciclável',
    name: 'Papel engordurado ou sujo',
    recyclable: false,
    preparation:
      'Descarte no lixo comum; se tiver só restos de comida, pode ir para a compostagem.',
    synonyms: ['papel sujo', 'caixa de pizza suja', 'papel manteiga'],
  },
  {
    category: 'Não reciclável',
    name: 'Bitucas de cigarro',
    recyclable: false,
    preparation: 'Apague bem e descarte no lixo comum.',
    synonyms: ['cigarro', 'bituca'],
  },
];

// ───────────────────────── Região e pontos ─────────────────────────

const REGION = {
  name: 'Vila Mariana',
  city: 'São Paulo',
  state: 'SP',
  neighborhoods: [
    'Vila Mariana',
    'Vila Clementino',
    'Paraíso',
    'Chácara Klabin',
    'Aclimação',
  ],
  centerLatitude: -23.5891,
  centerLongitude: -46.6345,
  radiusKm: 3,
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const everyWeekday = (opensAt: string, closesAt: string) =>
  WEEKDAYS.map((weekday) => ({ weekday, opensAt, closesAt }));
const saturday = (opensAt: string, closesAt: string) => [
  { weekday: 6, opensAt, closesAt },
];

interface PointSeed {
  name: string;
  type: CollectionPointType;
  street: string;
  number: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  instructions: string;
  categories: CategoryName[];
  hours: { weekday: number; opensAt: string; closesAt: string }[];
  ownedByCooperative?: boolean;
}

const RECYCLABLES: CategoryName[] = [
  'Papel e papelão',
  'Plástico',
  'Vidro',
  'Metal',
];

const POINTS: PointSeed[] = [
  {
    name: 'Cooperativa Recicla Vila (sede)',
    type: CollectionPointType.COOPERATIVA,
    street: 'Rua Domingos de Morais',
    number: '1200',
    neighborhood: 'Vila Mariana',
    latitude: -23.5869,
    longitude: -46.6362,
    instructions:
      'Entregue os materiais limpos e secos, separados por tipo. Grandes volumes: avise antes.',
    categories: [...RECYCLABLES, 'Óleo de cozinha'],
    hours: [...everyWeekday('08:00', '17:00'), ...saturday('08:00', '12:00')],
    ownedByCooperative: true,
  },
  {
    name: 'Ecoponto Vila Mariana',
    type: CollectionPointType.ECOPONTO,
    street: 'Rua Afonso Celso',
    number: '147',
    neighborhood: 'Vila Mariana',
    latitude: -23.5925,
    longitude: -46.6398,
    instructions:
      'Recebe recicláveis e pequenos volumes de entulho. Leve um documento.',
    categories: [...RECYCLABLES, 'Eletrônicos'],
    hours: [
      ...everyWeekday('06:00', '22:00'),
      ...saturday('06:00', '22:00'),
      { weekday: 0, opensAt: '06:00', closesAt: '18:00' },
    ],
  },
  {
    name: 'PEV Praça do Bairro',
    type: CollectionPointType.PEV,
    street: 'Rua Joaquim Távora',
    number: '800',
    neighborhood: 'Vila Mariana',
    latitude: -23.5838,
    longitude: -46.6401,
    instructions:
      'Contêineres na praça. Coloque cada material no contêiner da cor correta.',
    categories: RECYCLABLES,
    hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opensAt: '00:00',
      closesAt: '23:59',
    })),
  },
  {
    name: 'PEV Estação Vila Mariana',
    type: CollectionPointType.PEV,
    street: 'Rua Vergueiro',
    number: '3100',
    neighborhood: 'Vila Mariana',
    latitude: -23.5893,
    longitude: -46.6349,
    instructions: 'Ao lado da saída da estação. Somente pequenos volumes.',
    categories: ['Papel e papelão', 'Plástico', 'Metal', 'Pilhas e baterias'],
    hours: [...everyWeekday('05:00', '23:00'), ...saturday('05:00', '23:00')],
  },
  {
    name: 'Mercado Bom Vizinho (coleta de pilhas e óleo)',
    type: CollectionPointType.COMERCIO,
    street: 'Avenida Lins de Vasconcelos',
    number: '1500',
    neighborhood: 'Vila Mariana',
    latitude: -23.5856,
    longitude: -46.6268,
    instructions:
      'Coletor de pilhas na entrada. Óleo usado: entregue em garrafa PET fechada no balcão.',
    categories: ['Pilhas e baterias', 'Óleo de cozinha'],
    hours: [
      ...everyWeekday('07:00', '22:00'),
      ...saturday('07:00', '22:00'),
      { weekday: 0, opensAt: '08:00', closesAt: '14:00' },
    ],
  },
  {
    name: 'Loja Conecta (eletrônicos)',
    type: CollectionPointType.COMERCIO,
    street: 'Rua Domingos de Morais',
    number: '2500',
    neighborhood: 'Vila Clementino',
    latitude: -23.5978,
    longitude: -46.6378,
    instructions:
      'Recebe celulares, cabos, carregadores e pequenos eletrônicos. Apague seus dados antes.',
    categories: ['Eletrônicos', 'Pilhas e baterias'],
    hours: [...everyWeekday('09:00', '19:00'), ...saturday('09:00', '14:00')],
  },
  {
    name: 'PEV Vila Clementino',
    type: CollectionPointType.PEV,
    street: 'Rua Borges Lagoa',
    number: '900',
    neighborhood: 'Vila Clementino',
    latitude: -23.5985,
    longitude: -46.6452,
    instructions:
      'Contêineres em frente à praça. Não deixe materiais fora dos contêineres.',
    categories: RECYCLABLES,
    hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opensAt: '06:00',
      closesAt: '22:00',
    })),
  },
  {
    name: 'Ecoponto Paraíso',
    type: CollectionPointType.ECOPONTO,
    street: 'Rua do Paraíso',
    number: '300',
    neighborhood: 'Paraíso',
    latitude: -23.5762,
    longitude: -46.6405,
    instructions:
      'Recebe recicláveis, eletrônicos e lâmpadas. Limite de 1 m³ por dia por pessoa.',
    categories: [...RECYCLABLES, 'Eletrônicos', 'Pilhas e baterias'],
    hours: [...everyWeekday('06:00', '22:00'), ...saturday('06:00', '22:00')],
  },
  {
    name: 'PEV Chácara Klabin',
    type: CollectionPointType.PEV,
    street: 'Rua Vergueiro',
    number: '3800',
    neighborhood: 'Chácara Klabin',
    latitude: -23.5932,
    longitude: -46.6298,
    instructions: 'Ponto de entrega voluntária junto ao estacionamento.',
    categories: ['Papel e papelão', 'Plástico', 'Vidro'],
    hours: [...everyWeekday('07:00', '20:00'), ...saturday('07:00', '18:00')],
  },
  {
    name: 'Feira de Trocas e Recicláveis da Aclimação',
    type: CollectionPointType.PEV,
    street: 'Rua Muniz de Sousa',
    number: '1100',
    neighborhood: 'Aclimação',
    latitude: -23.5712,
    longitude: -46.6298,
    instructions:
      'Funciona aos sábados, junto à feira do bairro. Traga os materiais já separados.',
    categories: [...RECYCLABLES, 'Óleo de cozinha'],
    hours: saturday('08:00', '13:00'),
  },
];

// ───────────────────────── Execução ─────────────────────────

async function upsertUser(
  email: string,
  name: string,
  role: Role,
  passwordHash: string,
  phone?: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      role,
      passwordHash,
      phone,
      lgpdConsentAt: new Date(),
    },
  });
}

async function main() {
  const passwordHash = await argon2.hash(SEED_PASSWORD);

  // Categorias e guia de materiais
  const categoryIds = new Map<CategoryName, string>();
  for (const category of CATEGORIES) {
    const saved = await prisma.materialCategory.upsert({
      where: { slug: slugify(category.name) },
      update: {},
      create: { ...category, slug: slugify(category.name) },
    });
    categoryIds.set(category.name, saved.id);
  }
  for (const material of MATERIALS) {
    const categoryId = categoryIds.get(material.category)!;
    const synonyms = material.synonyms ?? [];
    await prisma.material.upsert({
      where: { categoryId_name: { categoryId, name: material.name } },
      update: {},
      create: {
        categoryId,
        name: material.name,
        recyclable: material.recyclable,
        preparation: material.preparation,
        notes: material.notes,
        synonyms,
        searchText: normalize([material.name, ...synonyms].join(' ')),
      },
    });
  }

  // Região-polo
  const region = await prisma.region.upsert({
    where: {
      name_city_state: {
        name: REGION.name,
        city: REGION.city,
        state: REGION.state,
      },
    },
    update: {},
    create: REGION,
  });

  // Calendário da coleta seletiva porta a porta (terças e sextas pela manhã)
  if (
    (await prisma.collectionSchedule.count({
      where: { regionId: region.id },
    })) === 0
  ) {
    for (const weekday of [2, 5]) {
      await prisma.collectionSchedule.create({
        data: {
          regionId: region.id,
          weekday,
          period: Period.MANHA,
          notes:
            'Coloque os recicláveis na calçada até as 7h, em sacos fechados.',
          categories: {
            connect: RECYCLABLES.map((name) => ({
              id: categoryIds.get(name)!,
            })),
          },
        },
      });
    }
  }

  // Cooperativa e equipe
  let cooperative = await prisma.cooperative.findFirst({
    where: { name: 'Cooperativa Recicla Vila' },
  });
  cooperative ??= await prisma.cooperative.create({
    data: {
      name: 'Cooperativa Recicla Vila',
      phone: '(11) 5555-0100',
      email: 'contato@reciclavila.example',
      regions: { create: [{ regionId: region.id }] },
    },
  });

  await upsertUser(
    'admin@reciclabairro.local',
    'Administrador',
    Role.ADMIN,
    passwordHash,
  );
  await upsertUser(
    'patricia@reciclabairro.local',
    'Patrícia Lima',
    Role.EDUCADOR,
    passwordHash,
  );
  const staff: [string, string, Role, MemberRole][] = [
    [
      'marta@reciclabairro.local',
      'Marta Ferreira',
      Role.GESTOR_COOPERATIVA,
      MemberRole.GESTOR,
    ],
    [
      'carlos@reciclabairro.local',
      'Carlos Souza',
      Role.COLETOR,
      MemberRole.COLETOR,
    ],
    [
      'ana@reciclabairro.local',
      'Ana Pereira',
      Role.COLETOR,
      MemberRole.COLETOR,
    ],
  ];
  for (const [email, name, role, memberRole] of staff) {
    const user = await upsertUser(email, name, role, passwordHash);
    await prisma.cooperativeMember.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        cooperativeId: cooperative.id,
        role: memberRole,
      },
    });
  }

  // Moradora e comerciante, cada um com um endereço na região
  const residents: [
    string,
    string,
    Role,
    {
      street: string;
      number: string;
      neighborhood: string;
      latitude: number;
      longitude: number;
      zipCode: string;
      label: string;
    },
  ][] = [
    [
      'juliana@reciclabairro.local',
      'Juliana Martins',
      Role.MORADOR,
      {
        label: 'Casa',
        street: 'Rua França Pinto',
        number: '500',
        neighborhood: 'Vila Mariana',
        latitude: -23.5876,
        longitude: -46.6412,
        zipCode: '04016-032',
      },
    ],
    [
      'roberto@reciclabairro.local',
      'Roberto Almeida',
      Role.COMERCIANTE,
      {
        label: 'Minimercado',
        street: 'Rua Humberto I',
        number: '220',
        neighborhood: 'Vila Mariana',
        latitude: -23.5902,
        longitude: -46.6371,
        zipCode: '04018-030',
      },
    ],
  ];
  for (const [email, name, role, address] of residents) {
    const user = await upsertUser(email, name, role, passwordHash);
    if ((await prisma.address.count({ where: { userId: user.id } })) === 0) {
      await prisma.address.create({
        data: {
          ...address,
          userId: user.id,
          city: REGION.city,
          state: REGION.state,
          regionId: region.id,
          isPrimary: true,
        },
      });
    }
  }

  // Pontos de coleta
  for (const point of POINTS) {
    const exists = await prisma.collectionPoint.findFirst({
      where: { name: point.name },
    });
    if (exists) continue;
    const { categories, hours, ownedByCooperative, ...data } = point;
    await prisma.collectionPoint.create({
      data: {
        ...data,
        city: REGION.city,
        state: REGION.state,
        regionId: region.id,
        cooperativeId: ownedByCooperative ? cooperative.id : null,
        categories: {
          create: categories.map((name) => ({
            categoryId: categoryIds.get(name)!,
          })),
        },
        hours: { create: hours },
      },
    });
  }

  const counts = {
    categorias: await prisma.materialCategory.count(),
    materiais: await prisma.material.count(),
    pontos: await prisma.collectionPoint.count(),
    usuarios: await prisma.user.count(),
  };
  console.log('Seed concluído:', counts);
  console.log(
    'Contas de demonstração (senha definida em SEED_PASSWORD no .env): admin@, patricia@, marta@, carlos@, ana@, juliana@ e roberto@reciclabairro.local',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
