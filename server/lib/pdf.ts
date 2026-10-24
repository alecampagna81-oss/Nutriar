import PDFDocument from 'pdfkit';
import type { PlanContent } from '../../shared/nutrition.js';
import { buildShoppingList, dayLabel, dayTotals, describeQuantity, formatAmount, formatTotal, NUTRIENT_LABELS, NUTRIENTS } from '../../shared/nutrition.js';
import { config } from '../config.js';

// Las fuentes estándar de PDF no incluyen algunos símbolos: se reemplazan.
const t = (s: string) => s.replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/[^\x00-\xff·×]/g, '');

export interface PdfInput {
  title: string;
  patientName: string;
  professionalName: string;
  versionNo: number;
  publishedAt: string | null;
  content: PlanContent;
  showNutrients: boolean;
  compress?: boolean;
}

export function planPdf(input: PdfInput): Promise<Buffer> {
  const { content } = input;
  const doc = new PDFDocument({ size: 'A4', margin: 48, compress: input.compress ?? true, info: { Title: t(input.title), Producer: config.appName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const green = '#2f6b4f';
  const gray = '#555555';

  doc.fillColor(green).fontSize(18).font('Helvetica-Bold').text(t(input.title));
  doc.moveDown(0.2).fillColor(gray).fontSize(10).font('Helvetica')
    .text(t(`Paciente: ${input.patientName}  ·  Profesional: ${input.professionalName}`))
    .text(t(`Versión ${input.versionNo}${input.publishedAt ? ` · publicada el ${new Date(input.publishedAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : ' · BORRADOR (no publicado)'}`));
  doc.moveDown();

  if (content.general_notes) {
    doc.fillColor('black').font('Helvetica-Bold').fontSize(12).text('Indicaciones generales');
    doc.font('Helvetica').fontSize(10).text(t(content.general_notes));
    doc.moveDown();
  }
  if (content.supplements.length) {
    doc.fillColor('black').font('Helvetica-Bold').fontSize(12).text('Suplementos indicados por tu profesional');
    doc.font('Helvetica').fontSize(10);
    for (const s of content.supplements) {
      doc.text(t(`• ${s.name}${s.dose ? ` - ${s.dose}` : ''}${s.frequency ? ` - ${s.frequency}` : ''}${s.timing ? ` - ${s.timing}` : ''}${s.notes ? ` (${s.notes})` : ''}`));
    }
    doc.moveDown();
  }

  const mealKeys = content.meals.map((m) => m.key);
  for (const day of content.days) {
    const hasItems = mealKeys.some((k) => (day.meals[k] ?? []).length);
    if (!hasItems) continue;
    if (doc.y > 680) doc.addPage();
    doc.moveDown(0.5).fillColor(green).font('Helvetica-Bold').fontSize(13).text(t(dayLabel(day, content.weeks)));
    if (day.note) doc.fillColor(gray).font('Helvetica-Oblique').fontSize(9).text(t(day.note));
    const totals = dayTotals(day, mealKeys);
    for (const meal of content.meals) {
      const items = day.meals[meal.key] ?? [];
      if (!items.length) continue;
      if (doc.y > 720) doc.addPage();
      doc.moveDown(0.3).fillColor('black').font('Helvetica-Bold').fontSize(11).text(t(`${meal.name}${meal.time ? ` (${meal.time})` : ''}`));
      doc.font('Helvetica').fontSize(10);
      for (const it of items) {
        const s = it.snapshot!;
        doc.fillColor('black').text(t(`• ${describeQuantity(it, s)} de ${s.name}${s.brand ? ` (${s.brand})` : ''}${it.gross ? ' (peso con desperdicio)' : ''}${it.note ? ` - ${it.note}` : ''}`), { indent: 8 });
        for (const a of it.alternatives ?? []) {
          doc.fillColor(gray).text(t(`o bien: ${describeQuantity(a, a.snapshot!)} de ${a.snapshot!.name}${a.note ? ` - ${a.note}` : ''}`), { indent: 24 });
        }
      }
      if (input.showNutrients) {
        const tm = totals.perMeal[meal.key];
        doc.fillColor(gray).fontSize(8).text(t(NUTRIENTS.map((k) => `${NUTRIENT_LABELS[k].label}: ${formatTotal(tm[k], NUTRIENT_LABELS[k].unit, k === 'energy_kcal' ? 0 : 1)}`).join(' · ')), { indent: 8 });
        doc.fontSize(10);
      }
    }
    if (input.showNutrients) {
      doc.moveDown(0.2).fillColor(green).font('Helvetica-Bold').fontSize(9)
        .text(t('Total del día: ' + NUTRIENTS.map((k) => `${NUTRIENT_LABELS[k].label}: ${formatTotal(totals.total[k], NUTRIENT_LABELS[k].unit, k === 'energy_kcal' ? 0 : 1)}`).join(' · ')));
    }
  }

  // Lista de compras, una por semana del plan
  for (let w = 1; w <= content.weeks; w++) {
    const items = content.days.filter((d) => d.week === w).flatMap((d) => mealKeys.flatMap((k) => d.meals[k] ?? []));
    const list = buildShoppingList(items);
    if (!list.lines.length) continue;
    doc.addPage();
    doc.fillColor(green).font('Helvetica-Bold').fontSize(14).text(t(`Lista de compras${content.weeks > 1 ? ` - semana ${w}` : ''}`));
    doc.fillColor(gray).font('Helvetica').fontSize(9).text('Suma las cantidades de las opciones principales. No incluye alternativas.');
    doc.moveDown(0.5).fillColor('black').fontSize(10);
    for (const l of list.lines) {
      const extra = l.purchase_amount ? ` (comprar aprox. ${formatAmount(l.purchase_amount, l.unit)} con desperdicio)` : '';
      doc.text(t(`[ ] ${l.name}: ${formatAmount(l.amount, l.unit)}${extra}`));
    }
    for (const i of list.issues) doc.fillColor('#a33').text(t(`No incluido: ${i.name} - ${i.reason}`));
  }

  doc.moveDown(2).fillColor(gray).fontSize(8).font('Helvetica')
    .text(t(`Generado por ${config.appName}. Este plan fue elaborado por tu profesional. Ante dudas, consultala. Los valores nutricionales se calculan a partir de las fuentes registradas en cada alimento; "faltan datos" indica información no disponible, no un valor cero.`));
  doc.end();
  return done;
}
