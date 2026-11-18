/** Utilidades para datas "só dia" (YYYY-MM-DD), sempre no fuso da aplicação. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  return Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/** Data de hoje no fuso informado, como "YYYY-MM-DD". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const p = parts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Dia da semana (0 = domingo) e hora "HH:MM" no fuso informado. */
export function weekdayAndTimeIn(
  timeZone: string,
  now: Date = new Date(),
): { weekday: number; time: string } {
  const p = parts(now, timeZone);
  return {
    weekday: WEEKDAYS.indexOf(p.weekday),
    time: `${p.hour}:${p.minute}`,
  };
}

/** Instante em que o dia "YYYY-MM-DD" começa no fuso informado. */
export function startOfDayIn(dateOnly: string, timeZone: string): Date {
  const utcMidnight = new Date(`${dateOnly}T00:00:00.000Z`);
  const p = parts(utcMidnight, timeZone);
  const localAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
  const offsetMs = localAsUtc - utcMidnight.getTime();
  return new Date(utcMidnight.getTime() - offsetMs);
}

/** Soma dias a uma data "YYYY-MM-DD". */
export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date à meia-noite UTC (formato usado nas colunas DATE). */
export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date de coluna DATE → "YYYY-MM-DD". */
export function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "DD/MM/YYYY", para mensagens ao usuário. */
export function formatDateBr(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
