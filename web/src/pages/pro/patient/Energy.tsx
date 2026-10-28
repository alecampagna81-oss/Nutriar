import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { dt, formatDate } from '../../../lib/format';
import { Alert, Badge, Button, Card, ErrorBox, Field, Input, Loading, Select, useAction } from '../../../components/ui';
import { ACTIVITY_FACTORS, computeEnergy, DEFAULT_MACROS, formulaByKey, FORMULAS, IOM_LEVELS, PHYSIO, type EnergyConfig } from '@shared/energy';

// Los campos numéricos se editan como texto para aceptar coma decimal.
type Form = Omit<EnergyConfig, 'inputs' | 'adjustment_kcal' | 'manual_kcal' | 'protein_pct' | 'fat_pct' | 'carbs_pct'> & {
  sex: string;
  age: string;
  weight: string;
  height: string;
  fat: string;
  adjustment: string;
  manual: string;
  protein: string;
  fatPct: string;
  carbs: string;
};

const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const num = (s: string) => {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function toForm(c: EnergyConfig): Form {
  return {
    formula: c.formula, activity: c.activity, iom_level: c.iom_level, physio: c.physio,
    sex: c.inputs.sex ?? '', age: str(c.inputs.age_years), weight: str(c.inputs.weight_kg), height: str(c.inputs.height_cm), fat: str(c.inputs.body_fat_pct),
    adjustment: c.adjustment_kcal ? String(c.adjustment_kcal) : '', manual: str(c.manual_kcal),
    protein: str(c.protein_pct), fatPct: str(c.fat_pct), carbs: str(c.carbs_pct),
  };
}

function toConfig(f: Form): EnergyConfig {
  const round = (n: number | null) => (n == null ? null : Math.round(n));
  return {
    formula: f.formula, activity: f.activity, iom_level: f.iom_level, physio: f.physio,
    adjustment_kcal: round(num(f.adjustment)) ?? 0,
    manual_kcal: round(num(f.manual)),
    protein_pct: num(f.protein) ?? 0, fat_pct: num(f.fatPct) ?? 0, carbs_pct: num(f.carbs) ?? 0,
    inputs: {
      sex: f.sex === 'femenino' || f.sex === 'masculino' ? f.sex : null,
      age_years: num(f.age), weight_kg: num(f.weight), height_cm: num(f.height), body_fat_pct: num(f.fat),
    },
  };
}

export function Energy({ patientId }: { patientId: string }) {
  const { data, error, loading, reload } = useApi<any>(`/api/pro/patients/${patientId}/energy`);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const { busy, run } = useAction();

  function fromDefaults(d: any): Form {
    return toForm({
      formula: 'mifflin', activity: 'moderado', iom_level: 'poco_activo', physio: 'ninguna', adjustment_kcal: 0, manual_kcal: null, ...DEFAULT_MACROS,
      inputs: { sex: d.sex, age_years: d.age_years, weight_kg: d.weight_kg, height_cm: d.height_cm, body_fat_pct: d.body_fat_pct },
    });
  }
  useEffect(() => {
    if (data) setForm(data.saved ? toForm(data.saved.config) : fromDefaults(data.defaults));
  }, [data]);

  const config = useMemo(() => (form ? toConfig(form) : null), [form]);
  const result = useMemo(() => (config ? computeEnergy(config) : null), [config]);

  if (loading && !form) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!form || !config || !result) return null;

  const d = data.defaults;
  const f = formulaByKey(form.formula)!;
  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setDirty(true);
  };
  function useLatest() {
    set({ sex: d.sex ?? '', age: str(d.age_years), weight: str(d.weight_kg), height: str(d.height_cm), fat: str(d.body_fat_pct) });
  }
  async function save() {
    if (await run(() => api.put(`/api/pro/patients/${patientId}/energy`, config), 'Requerimiento guardado')) {
      setDirty(false);
      reload();
    }
  }
  const sum = (num(form.protein) ?? 0) + (num(form.fatPct) ?? 0) + (num(form.carbs) ?? 0);
  const isIom = form.formula === 'iom2005';
  const age = num(form.age);
  const showFat = form.formula === 'katch' || form.formula === 'cunningham';
  const differs =
    (d.weight_kg != null && num(form.weight) !== d.weight_kg) || (d.height_cm != null && num(form.height) !== d.height_cm) || (d.age_years != null && age !== d.age_years);
  const saved = data.saved;

  return (
    <div className="stack">
      <Card
        title="Requerimiento energético"
        actions={
          <>
            {dirty ? <span className="badge badge-warn">Cambios sin guardar</span> : null}
            <Button onClick={save} busy={busy} disabled={!dirty || !result.ok || !result.macros}>Guardar</Button>
          </>
        }
      >
        <Alert tone="info">
          Lo ve solo la profesional. El objetivo guardado aparece en el editor de planes, junto al total del día.
          {saved ? ` Última modificación: ${dt(saved.updated_at)}${saved.updated_by_name ? ` por ${saved.updated_by_name}` : ''}.` : ' Todavía no se guardó un requerimiento para este paciente.'}
        </Alert>

        <h3>Datos del paciente</h3>
        <div className="grid-3">
          <Field label="Sexo para el cálculo">{(id) => (
            <Select id={id} value={form.sex} onChange={(e) => set({ sex: e.target.value })}>
              <option value="">Elegir…</option>
              <option value="femenino">Femenino</option>
              <option value="masculino">Masculino</option>
            </Select>
          )}</Field>
          <Field label="Edad (años)" hint={age != null && age < 3 ? `${Math.floor(Math.round(age * 1200) / 100)} meses. Para meses usá decimales: 0,5 = 6 meses.` : 'Admite decimales: 0,5 = 6 meses.'}>{(id) => <Input id={id} inputMode="decimal" value={form.age} onChange={(e) => set({ age: e.target.value })} placeholder="años" />}</Field>
          <Field label="Peso (kg)" hint={d.measured_on.peso ? `Último registro: ${formatDate(d.measured_on.peso)}` : 'Sin peso registrado en Mediciones'}>{(id) => <Input id={id} inputMode="decimal" value={form.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="kg" />}</Field>
          <Field label="Talla (cm)" hint={d.measured_on.talla ? `Último registro: ${formatDate(d.measured_on.talla)}` : 'Sin talla registrada en Mediciones'}>{(id) => <Input id={id} inputMode="decimal" value={form.height} onChange={(e) => set({ height: e.target.value })} placeholder="cm" />}</Field>
          {showFat ? (
            <Field label="Grasa corporal (%)" hint={d.measured_on.grasa_corporal ? `Último registro: ${formatDate(d.measured_on.grasa_corporal)}` : 'Necesaria para fórmulas de masa magra'}>{(id) => <Input id={id} inputMode="decimal" value={form.fat} onChange={(e) => set({ fat: e.target.value })} placeholder="%" />}</Field>
          ) : null}
        </div>
        {differs ? <p className="small"><button className="btn btn-ghost btn-sm" onClick={useLatest}>Usar los últimos datos de Mediciones</button></p> : null}

        <h3>Cálculo</h3>
        <div className="grid-3">
          <Field label="Fórmula" hint={`${f.ages}. ${f.ref}`}>{(id) => (
            <Select id={id} value={form.formula} onChange={(e) => set({ formula: e.target.value as Form['formula'] })}>
              {FORMULAS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          )}</Field>
          {f.kind === 'basal' ? (
            <Field label="Actividad" hint="Factor que multiplica el metabolismo basal">{(id) => (
              <Select id={id} value={form.activity} onChange={(e) => set({ activity: e.target.value as Form['activity'] })}>
                {ACTIVITY_FACTORS.map((x) => <option key={x.key} value={x.key}>{x.label} (×{String(x.factor).replace('.', ',')})</option>)}
              </Select>
            )}</Field>
          ) : null}
          {isIom && !(age != null && age < 3) ? (
            <Field label="Actividad (IOM)" hint="El coeficiente depende de la edad y el sexo">{(id) => (
              <Select id={id} value={form.iom_level} onChange={(e) => set({ iom_level: e.target.value as Form['iom_level'] })}>
                {IOM_LEVELS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </Select>
            )}</Field>
          ) : null}
          {f.kind !== 'manual' && form.sex === 'femenino' ? (
            <Field label="Embarazo o lactancia" hint="Adicionales de IOM 2005">{(id) => (
              <Select id={id} value={form.physio} onChange={(e) => set({ physio: e.target.value as Form['physio'] })}>
                {PHYSIO.map((x) => <option key={x.key} value={x.key}>{x.label}{x.add ? ` (+${x.add} kcal)` : ''}</option>)}
              </Select>
            )}</Field>
          ) : null}
          {f.kind !== 'manual' ? (
            <Field label="Ajuste por objetivo (kcal/día)" hint="Negativo para bajar, positivo para subir. Vacío = mantener.">{(id) => <Input id={id} inputMode="numeric" value={form.adjustment} onChange={(e) => set({ adjustment: e.target.value })} placeholder="0" />}</Field>
          ) : null}
          <Field label={f.kind === 'manual' ? 'kcal objetivo/día' : 'kcal objetivo/día (opcional)'} hint={f.kind === 'manual' ? undefined : 'Si lo completás, reemplaza al resultado de la fórmula'}>{(id) => <Input id={id} inputMode="numeric" value={form.manual} onChange={(e) => set({ manual: e.target.value })} placeholder={result.calculated ? String(result.calculated) : ''} />}</Field>
        </div>

        {result.missing.length ? <Alert tone="warn">Para calcular falta: {result.missing.join(', ')}.</Alert> : null}
        {result.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
        {result.steps.length ? (
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "0.6rem 0.8rem", marginTop: "0.6rem" }}>
            <strong>Cómo se calculó</strong>
            <ul className="small" style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>{result.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        ) : null}
        {result.total != null ? (
          <p style={{ fontSize: '1.4rem', margin: '0.8rem 0 0' }}>
            Objetivo: <strong>{result.total.toLocaleString('es-AR')} kcal/día</strong>
          </p>
        ) : null}
      </Card>

      <Card title="Reparto de macronutrientes">
        <div className="grid-3">
          <Field label="Proteínas (%)">{(id) => <Input id={id} inputMode="decimal" value={form.protein} onChange={(e) => set({ protein: e.target.value })} />}</Field>
          <Field label="Grasas (%)">{(id) => <Input id={id} inputMode="decimal" value={form.fatPct} onChange={(e) => set({ fatPct: e.target.value })} />}</Field>
          <Field label="Carbohidratos (%)">{(id) => <Input id={id} inputMode="decimal" value={form.carbs} onChange={(e) => set({ carbs: e.target.value })} />}</Field>
        </div>
        <p className="small">
          {Math.abs(sum - 100) < 0.01 ? <Badge tone="ok">Suma 100 % ✓</Badge> : <Badge tone="danger">Suma {String(Math.round(sum * 10) / 10).replace('.', ',')} %: tiene que dar 100 %</Badge>}
        </p>
        {result.macros ? (
          <div className="kv">
            <span>Proteínas</span><strong>{result.macros.protein_g} g{num(form.weight) ? ` (${(result.macros.protein_g / (num(form.weight) as number)).toFixed(1).replace('.', ',')} g/kg)` : ''}</strong>
            <span>Grasas</span><strong>{result.macros.fat_g} g</strong>
            <span>Carbohidratos</span><strong>{result.macros.carbs_g} g</strong>
          </div>
        ) : null}
        <p className="small muted">Gramos calculados con 4 kcal/g para proteínas y carbohidratos, y 9 kcal/g para grasas.</p>
      </Card>
    </div>
  );
}
