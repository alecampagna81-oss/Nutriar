import { DEFAULT_TZ, formatDate, formatDateTime, localDate } from '@shared/time';

export { formatDate };
export const todayIn = (tz = DEFAULT_TZ) => localDate(new Date(), tz);
export const dt = (d: string | Date, tz = DEFAULT_TZ, opts?: Intl.DateTimeFormatOptions) => formatDateTime(d, tz, opts ?? { dateStyle: 'medium', timeStyle: 'short' });
export const timeOnly = (d: string | Date, tz = DEFAULT_TZ) => formatDateTime(d, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const num = (n: number | null | undefined, dec = 1) => (n === null || n === undefined ? '—' : (Math.round(n * 10 ** dec) / 10 ** dec).toLocaleString('es-AR'));
export const ago = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};
export const STATUS_APPT: Record<string, string> = { programado: 'Pendiente de confirmar', confirmado: 'Confirmado', cambio_solicitado: 'Pidió cambio', cancelado: 'Cancelado', realizado: 'Realizado' };
export const MODALITY: Record<string, string> = { presencial: 'Presencial', virtual: 'Virtual', telefonica: 'Telefónica' };
export const VERIFICATION: Record<string, { label: string; tone: string; help: string }> = {
  verificado: { label: 'Verificado', tone: 'ok', help: 'Cotejado con la fuente primaria.' },
  fuente_secundaria: { label: 'Fuente pública', tone: 'info', help: 'Valores de una fuente pública reconocida (USDA SR28), sin cotejo independiente en NutriAR.' },
  sin_verificar: { label: 'Sin verificar', tone: 'warn', help: 'Cargado manualmente por una profesional; no fue verificado.' },
  calculado: { label: 'Calculado', tone: 'info', help: 'Calculado a partir de los ingredientes y el rendimiento declarado.' },
  demo: { label: 'DEMO ficticio', tone: 'danger', help: 'Dato ficticio para demostración. No usar clínicamente.' },
};
export const MEAL_STATUS: Record<string, string> = { cumplida: 'Cumplida', parcial: 'Parcial', no_cumplida: 'No cumplida', fuera_del_plan: 'Fuera del plan' };
