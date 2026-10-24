// Utilidades de zona horaria sin dependencias externas.

/** Diferencia (minutos) entre la hora local de `tz` y UTC en el instante `date`. */
function tzOffsetMinutes(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Convierte "AAAA-MM-DDTHH:mm" expresado en la zona `tz` a un instante UTC. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error('Fecha y hora inválidas');
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let off = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off) utc = guess - off2 * 60000;
  return new Date(utc);
}

/** Fecha local (AAAA-MM-DD) de un instante en la zona indicada. */
export function localDate(d: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}

/** "AAAA-MM-DDTHH:mm" local de un instante en la zona indicada (para inputs datetime-local). */
export function localDateTime(d: Date | string, tz: string): string {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));
  return s.replace(' ', 'T');
}

export function formatDateTime(d: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, ...opts }).format(new Date(d));
}

export function formatDate(d: string) {
  // d = AAAA-MM-DD (fecha calendario, sin zona)
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, day)));
}

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
