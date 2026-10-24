export interface MeasureKind {
  key: string;
  label: string;
  unit: string;
  group: 'antropometria' | 'perimetros' | 'composicion' | 'pliegues';
  min: number;
  max: number;
  patientCanReport: boolean;
}

export const MEASURE_KINDS: MeasureKind[] = [
  { key: 'peso', label: 'Peso', unit: 'kg', group: 'antropometria', min: 1, max: 400, patientCanReport: true },
  { key: 'talla', label: 'Talla', unit: 'cm', group: 'antropometria', min: 40, max: 250, patientCanReport: false },
  { key: 'cintura', label: 'Perímetro de cintura', unit: 'cm', group: 'perimetros', min: 30, max: 250, patientCanReport: true },
  { key: 'cadera', label: 'Perímetro de cadera', unit: 'cm', group: 'perimetros', min: 30, max: 250, patientCanReport: true },
  { key: 'brazo', label: 'Perímetro de brazo', unit: 'cm', group: 'perimetros', min: 10, max: 80, patientCanReport: true },
  { key: 'muslo', label: 'Perímetro de muslo', unit: 'cm', group: 'perimetros', min: 20, max: 120, patientCanReport: true },
  { key: 'pantorrilla', label: 'Perímetro de pantorrilla', unit: 'cm', group: 'perimetros', min: 15, max: 80, patientCanReport: false },
  { key: 'grasa_corporal', label: 'Grasa corporal', unit: '%', group: 'composicion', min: 1, max: 75, patientCanReport: false },
  { key: 'masa_muscular', label: 'Masa muscular', unit: 'kg', group: 'composicion', min: 1, max: 150, patientCanReport: false },
  { key: 'agua_corporal', label: 'Agua corporal', unit: '%', group: 'composicion', min: 20, max: 80, patientCanReport: false },
  { key: 'grasa_visceral', label: 'Grasa visceral (nivel del equipo)', unit: 'nivel', group: 'composicion', min: 1, max: 60, patientCanReport: false },
  { key: 'pliegue_tricipital', label: 'Pliegue tricipital', unit: 'mm', group: 'pliegues', min: 1, max: 80, patientCanReport: false },
  { key: 'pliegue_subescapular', label: 'Pliegue subescapular', unit: 'mm', group: 'pliegues', min: 1, max: 80, patientCanReport: false },
];

export const kindByKey = (k: string) => MEASURE_KINDS.find((m) => m.key === k);

/** Indicadores calculados: solo cuando existen las mediciones necesarias. */
export const DERIVED = [
  { key: 'imc', label: 'IMC (calculado)', unit: 'kg/m²', needs: ['peso', 'talla'] },
  { key: 'cintura_talla', label: 'Índice cintura/talla (calculado)', unit: '', needs: ['cintura', 'talla'] },
];

export interface MeasurementRow {
  measured_on: string;
  kind: string;
  value: number;
}

/**
 * Serie de IMC: para cada peso usa la última talla registrada hasta esa fecha.
 * Si no hay talla previa, ese punto no se calcula.
 */
export function derivedSeries(rows: MeasurementRow[], key: 'imc' | 'cintura_talla') {
  const tallas = rows.filter((r) => r.kind === 'talla').sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const base = rows.filter((r) => r.kind === (key === 'imc' ? 'peso' : 'cintura')).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const out: { measured_on: string; value: number }[] = [];
  for (const r of base) {
    const t = [...tallas].reverse().find((x) => x.measured_on <= r.measured_on);
    if (!t) continue;
    const m = t.value / 100;
    out.push({ measured_on: r.measured_on, value: key === 'imc' ? Math.round((r.value / (m * m)) * 10) / 10 : Math.round((r.value / t.value) * 100) / 100 });
  }
  return out;
}
