// Requerimiento energético: casos calculados a mano con los coeficientes publicados.
import { describe, expect, it } from 'vitest';
import { ageFromBirth, computeEnergy, type EnergyConfig } from '../shared/energy.js';
import { newPatientWithAccount, newProfessional } from './helpers.js';

const cfg = (over: Partial<EnergyConfig>, inputs: Partial<EnergyConfig['inputs']> = {}): EnergyConfig => ({
  formula: 'mifflin', activity: 'sedentario', iom_level: 'sedentario', physio: 'ninguna', adjustment_kcal: 0, manual_kcal: null,
  protein_pct: 20, fat_pct: 30, carbs_pct: 50,
  ...over,
  inputs: { sex: 'femenino', age_years: 30, weight_kg: 60, height_cm: 165, body_fat_pct: null, ...inputs },
});

describe('fórmulas de requerimiento energético', () => {
  it('Mifflin-St Jeor con factor de actividad', () => {
    const r = computeEnergy(cfg({ activity: 'moderado' }));
    expect(r.basal).toBe(1320); // 600 + 1031,25 − 150 − 161
    expect(r.total).toBe(2046); // × 1,55
  });
  it('Harris-Benedict 1984 (varón) y 1919 (mujer)', () => {
    expect(computeEnergy(cfg({ formula: 'hb1984' }, { sex: 'masculino', age_years: 40, weight_kg: 80, height_cm: 180 })).basal).toBe(1797);
    expect(computeEnergy(cfg({ formula: 'hb1919' })).basal).toBe(1394);
  });
  it('FAO/OMS/UNU 1985 y Schofield usan el rango de edad', () => {
    expect(computeEnergy(cfg({ formula: 'fao1985' })).basal).toBe(1351); // 30–59 años: 8,7 × 60 + 829
    expect(computeEnergy(cfg({ formula: 'schofield' }, { sex: 'masculino', age_years: 25, weight_kg: 70 })).basal).toBe(1746);
  });
  it('fórmulas de masa magra necesitan el % de grasa', () => {
    expect(computeEnergy(cfg({ formula: 'katch' })).missing).toContain('porcentaje de grasa corporal');
    expect(computeEnergy(cfg({ formula: 'katch' }, { weight_kg: 80, body_fat_pct: 20 })).basal).toBe(1752);
    expect(computeEnergy(cfg({ formula: 'cunningham' }, { weight_kg: 80, body_fat_pct: 20 })).basal).toBe(1908);
  });
  it('IOM 2005: adulta, embarazo, niño y lactante', () => {
    expect(computeEnergy(cfg({ formula: 'iom2005', iom_level: 'poco_activo' })).total).toBe(2117);
    expect(computeEnergy(cfg({ formula: 'iom2005', iom_level: 'poco_activo', physio: 'embarazo_2' })).total).toBe(2457);
    expect(computeEnergy(cfg({ formula: 'iom2005', iom_level: 'activo' }, { sex: 'masculino', age_years: 6, weight_kg: 20, height_cm: 115 })).total).toBe(1718);
    const bebe = computeEnergy(cfg({ formula: 'iom2005' }, { age_years: 0.5, weight_kg: 7.5, height_cm: null }));
    expect(bebe.total).toBe(624); // 89 × 7,5 − 100 + 56
  });
  it('ajuste, valor propio y reparto de macronutrientes', () => {
    expect(computeEnergy(cfg({ activity: 'moderado', adjustment_kcal: -500 })).total).toBe(1546);
    const r = computeEnergy(cfg({ manual_kcal: 2000 }));
    expect(r.total).toBe(2000);
    expect(r.macros).toEqual({ protein_g: 100, fat_g: 67, carbs_g: 250 });
    expect(computeEnergy(cfg({ protein_pct: 25 })).macros).toBeNull();
  });
  it('advierte fórmulas de adultos en menores y faltantes', () => {
    expect(computeEnergy(cfg({}, { age_years: 12 })).warnings.join(' ')).toMatch(/adultos/);
    expect(computeEnergy(cfg({}, { sex: null })).ok).toBe(false);
  });
  it('edad desde la fecha de nacimiento', () => {
    expect(ageFromBirth('2026-03-28', new Date('2026-10-28T12:00:00'))).toBeCloseTo(7 / 12, 3);
    expect(ageFromBirth('1990-11-01', new Date('2026-10-28T12:00:00'))).toBe(35);
  });
});

describe('API de requerimiento energético', () => {
  it('sugiere datos de Mediciones, guarda, aísla y aparece en el plan', async () => {
    const { c: pro } = await newProfessional();
    const { patientId } = await newPatientWithAccount(pro);
    await pro.patch(`/api/pro/patients/${patientId}`, { sex: 'femenino', birth_date: '1996-01-15' });
    await pro.post(`/api/pro/patients/${patientId}/measurements`, { measured_on: '2026-10-01', kind: 'peso', value: 60 });
    await pro.post(`/api/pro/patients/${patientId}/measurements`, { measured_on: '2026-10-01', kind: 'talla', value: 165 });
    const g = await pro.get(`/api/pro/patients/${patientId}/energy`);
    expect(g.status).toBe(200);
    expect(g.body.saved).toBeNull();
    expect(g.body.defaults).toMatchObject({ weight_kg: 60, height_cm: 165 });

    const body = cfg({ activity: 'moderado' }, { sex: 'femenino', age_years: 30 });
    const bad = await pro.put(`/api/pro/patients/${patientId}/energy`, { ...body, inputs: { ...body.inputs, weight_kg: null } });
    expect(bad.status).toBe(400);
    const ok = await pro.put(`/api/pro/patients/${patientId}/energy`, body);
    expect(ok.status).toBe(200);
    expect(ok.body.result.total).toBe(2046);

    const { c: other } = await newProfessional('Lic. Otra');
    expect((await other.get(`/api/pro/patients/${patientId}/energy`)).status).toBe(404);

    const plan = await pro.post('/api/pro/plans', { patient_id: patientId, title: 'Plan con objetivo' });
    const pg = await pro.get(`/api/pro/plans/${plan.body.id}`);
    expect(Number(pg.body.energy.total)).toBe(2046);
  });
});
