import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, download, errorText } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { formulaByKey } from '@shared/energy';
import { dt, formatDate, num } from '../../lib/format';
import { Alert, Badge, Button, Card, Confirm, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Tabs, Textarea, Toggle, useAction, useToast } from '../../components/ui';
import { FoodBadges, FoodPicker } from '../../components/FoodPicker';
import { VSTATUS } from './patient/Plans';
import {
  ALLERGENS, allergenConflicts, buildDays, dayLabel, dayTotals, describeQuantity, formatAmount, formatTotal, itemNutrients, NUTRIENT_LABELS, NUTRIENTS,
  type FoodSnap, type NutrientKey, type PlanContent, type PlanDay, type PlanItem, type PlanItemBase,
} from '@shared/nutrition';

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || `comida_${uid()}`;

function NutrLine({ t }: { t: ReturnType<typeof dayTotals>['total'] }) {
  return (
    <span className="totals">
      {NUTRIENTS.map((k, i) => (
        <span key={k}>
          {i ? ' · ' : ''}
          {NUTRIENT_LABELS[k].label}: <strong>{formatTotal(t[k], NUTRIENT_LABELS[k].unit, k === 'energy_kcal' ? 0 : 1)}</strong>
        </span>
      ))}
    </span>
  );
}

function unitOptions(s: FoodSnap) {
  const o: { value: string; label: string }[] = [];
  if (s.recipe) o.push({ value: 'porcion', label: `porción (${num(s.recipe.yield_grams / s.recipe.servings, 0)} g)` });
  o.push({ value: 'g', label: 'gramos' });
  if (s.basis_unit === 'ml' || s.density_g_per_ml) o.push({ value: 'ml', label: 'mililitros' });
  for (const m of s.measures) if (!(s.recipe && m.name === '1 porción')) o.push({ value: `m:${m.id}`, label: m.name.includes('(') ? m.name : `${m.name} (${num(m.amount, 0)} ${m.unit})` });
  return o;
}

function ItemEditor({ item, onChange, onRemove, readOnly, allergens, isAlt }: { item: PlanItemBase & { snapshot?: FoodSnap }; onChange: (it: any) => void; onRemove: () => void; readOnly: boolean; allergens: string[]; isAlt?: boolean }) {
  const s = item.snapshot;
  if (!s) return <div className="item-row"><span className="muted">Alimento no disponible</span></div>;
  const n = itemNutrients(item, s);
  const conflicts = allergenConflicts(s, allergens);
  const unitValue = item.unit === 'medida' ? `m:${item.measure_id}` : item.unit;
  return (
    <div className={`item-row ${isAlt ? 'alt-row' : ''}`}>
      <div>
        {isAlt ? <span className="small muted">o bien: </span> : null}
        <span className="name">{s.name}</span>
        {s.brand ? <span className="muted small"> · {s.brand}</span> : null}{' '}
        <span className="row" style={{ gap: '0.25rem', display: 'inline-flex' }}>
          <FoodBadges f={s} />
          {s.is_demo ? <Badge tone="danger">DEMO</Badge> : null}
          {conflicts.map((a) => <Badge key={a} tone="danger">⚠ {ALLERGENS[a]}</Badge>)}
        </span>
      </div>
      <Input className="input-sm" aria-label="Cantidad" inputMode="decimal" disabled={readOnly} value={String(item.quantity)} onChange={(e) => onChange({ ...item, quantity: e.target.value.replace(',', '.') as unknown as number })} />
      <Select
        className="input-sm"
        aria-label="Unidad"
        disabled={readOnly}
        value={unitValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('m:')) onChange({ ...item, unit: 'medida', measure_id: v.slice(2), quantity: 1 });
          else onChange({ ...item, unit: v, measure_id: null, quantity: v === 'porcion' ? 1 : item.unit === 'medida' || item.unit === 'porcion' ? 100 : item.quantity });
        }}
      >
        {unitOptions(s).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <div className="row" style={{ gap: '0.2rem', flexWrap: 'nowrap' }}>
        {s.edible_portion_pct && s.edible_portion_pct < 100 && !s.recipe ? (
          <label className="small nowrap" title={`Porción comestible: ${s.edible_portion_pct} %`}>
            <input type="checkbox" disabled={readOnly} checked={!!item.gross} onChange={(e) => onChange({ ...item, gross: e.target.checked })} /> peso bruto
          </label>
        ) : null}
        {!readOnly ? <button className="icon-btn" aria-label={`Quitar ${s.name}`} onClick={onRemove}>×</button> : null}
      </div>
      <div className="nutr">
        {describeQuantity(item, s)}
        {item.gross ? ` · ${s.edible_portion_pct} % comestible` : ''}
        {' · '}
        {n.error ? <span style={{ color: 'var(--danger)' }}>{n.error}</span> : NUTRIENTS.map((k) => `${NUTRIENT_LABELS[k].label.slice(0, 4)}. ${n[k] === null ? 'sin dato' : num(n[k], k === 'energy_kcal' ? 0 : 1)}`).join(' · ')}
        {!readOnly ? (
          <Input className="input-sm" style={{ marginTop: '0.25rem' }} placeholder="Indicación (opcional): ej. cocido al horno" value={item.note ?? ''} onChange={(e) => onChange({ ...item, note: e.target.value })} aria-label="Indicación" />
        ) : item.note ? (
          <div>Indicación: {item.note}</div>
        ) : null}
      </div>
    </div>
  );
}

export function PlanEditor() {
  const { planId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const versionParam = params.get('version');
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/api/pro/plans/${planId}${versionParam ? `?version=${versionParam}` : ''}`);
  const [content, setContent] = useState<PlanContent | null>(null);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [dayKey, setDayKey] = useState('1-1');
  const [picker, setPicker] = useState<{ meal: string; altOf?: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmPublish, setConfirmPublish] = useState<string[] | null>(null);
  const [shopping, setShopping] = useState<any>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [mealsOpen, setMealsOpen] = useState(false);
  const { busy, run } = useAction();

  useEffect(() => {
    if (!data) return;
    setContent(structuredClone(data.version.content));
    setTitle(data.plan.title);
    setStartDate(data.version.start_date ?? '');
    setWarnings(data.warnings);
    setDirty(false);
  }, [data]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = useCallback((fn: (c: PlanContent) => void) => {
    setContent((c) => {
      const copy = structuredClone(c!);
      fn(copy);
      return copy;
    });
    setDirty(true);
  }, []);

  const allergens: string[] = data?.clinical?.allergens ?? [];
  const day: PlanDay | undefined = useMemo(() => content?.days.find((d) => `${d.week}-${d.day}` === dayKey), [content, dayKey]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!content || !day) return <Loading />;
  const { plan, versions, version, clinical, energy } = data;
  const target: (Record<NutrientKey, number> & { label: string }) | null = energy?.total
    ? { energy_kcal: Number(energy.total), protein_g: energy.macros?.protein_g, carbs_g: energy.macros?.carbs_g, fat_g: energy.macros?.fat_g, label: formulaByKey(energy.formula)?.label ?? 'requerimiento' }
    : null;
  const latest = versions[0];
  const readOnly = version.status !== 'borrador' || version.id !== latest.id;
  const totals = dayTotals(day, content.meals.map((m) => m.key));
  const localWarnings = new Set<string>();
  content.days.forEach((d) => Object.values(d.meals).flat().forEach((it) => [it, ...(it.alternatives ?? [])].forEach((x) => {
    const c = allergenConflicts(x.snapshot, allergens);
    if (c.length) localWarnings.add(`${x.snapshot!.name}: contiene ${c.map((a) => ALLERGENS[a]).join(', ')}`);
  })));

  async function addFood(food: any) {
    const target = picker!;
    setPicker(null);
    let snap: FoodSnap;
    try {
      snap = (await api.post('/api/foods/snapshots', { ids: [food.id] }))[food.id];
    } catch (e) {
      toast(errorText(e), 'danger');
      return;
    }
    const base: PlanItem = { id: uid(), food_id: food.id, quantity: snap.recipe ? 1 : 100, unit: snap.recipe ? 'porcion' : snap.basis_unit, snapshot: snap };
    update((c) => {
      const d = c.days.find((x) => `${x.week}-${x.day}` === dayKey)!;
      const list = d.meals[target.meal];
      if (target.altOf) {
        const it = list.find((x) => x.id === target.altOf)!;
        it.alternatives = [...(it.alternatives ?? []), base];
      } else list.push({ ...base, alternatives: [] });
    });
  }

  function payload() {
    const c = structuredClone(content!);
    c.days.forEach((d) => Object.values(d.meals).forEach((items) => items.forEach((it) => {
      it.quantity = Number(it.quantity);
      it.alternatives?.forEach((a) => (a.quantity = Number(a.quantity)));
    })));
    return { title, start_date: startDate || null, content: c, version_id: latest.id };
  }
  async function save(silent = false) {
    const r = await run(() => api.put(`/api/pro/plans/${planId}/draft`, payload()), silent ? undefined : 'Borrador guardado');
    if (r) {
      setDirty(false);
      setWarnings(r.warnings);
      setContent(r.version.content);
    }
    return !!r;
  }
  async function publish(ack = false) {
    if (dirty && !(await save(true))) return;
    try {
      await api.post(`/api/pro/plans/${planId}/publish`, { acknowledge_warnings: ack });
      toast('Plan publicado: el paciente ya puede verlo');
      setConfirmPublish(null);
      setParams({});
      reload();
    } catch (e: any) {
      if (e.status === 409 && e.details?.warnings) setConfirmPublish(e.details.warnings);
      else toast(errorText(e), 'danger');
    }
  }
  async function newVersion() {
    const r = await run(() => api.post(`/api/pro/plans/${planId}/new-version`), 'Nueva versión en borrador creada');
    if (r) {
      setParams({});
      reload();
    }
  }
  async function saveAsTemplate() {
    if (dirty && !readOnly && !(await save(true))) return;
    const r = await run(() => api.post('/api/pro/plans', { title: `${title} (plantilla)`, from_plan_id: planId, patient_id: null }), 'Plantilla creada');
    if (r) nav(`/pro/planes/${r.id}`);
  }
  async function openShopping(week = 1) {
    if (dirty && !readOnly && !(await save(true))) return;
    const r = await run(() => api.get(`/api/pro/plans/${planId}/shopping?week=${week}&version=${version.id}`));
    if (r) setShopping(r);
  }
  const setWeeks = (w: number) => update((c) => {
    c.weeks = w;
    c.days = buildDays(w, c.meals, c.days);
  });

  return (
    <>
      <PageHeader
        back={plan.patient_id ? <Link to={`/pro/pacientes/${plan.patient_id}/planes`} className="small">← {plan.first_name} {plan.last_name}</Link> : <Link to="/pro/plantillas" className="small">← Plantillas</Link>}
        title={
          <span className="row">
            {readOnly ? title : <Input aria-label="Título del plan" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} style={{ fontSize: '1.2rem', fontWeight: 700, minWidth: 260 }} />}
            <Badge tone={VSTATUS[version.status].tone}>v{version.version_no} · {VSTATUS[version.status].label}</Badge>
            {plan.is_template ? <Badge tone="info">Plantilla</Badge> : null}
            {dirty ? <Badge tone="warn">Cambios sin guardar</Badge> : null}
          </span>
        }
        actions={
          <>
            {!readOnly ? <Button variant="secondary" onClick={() => save()} busy={busy} disabled={!dirty}>Guardar borrador</Button> : null}
            {!readOnly && !plan.is_template ? <Button onClick={() => publish(false)} busy={busy}>Publicar</Button> : null}
            {readOnly && version.id === latest.id ? <Button onClick={newVersion} busy={busy}>Crear nueva versión para editar</Button> : null}
            {version.id !== latest.id ? <Button variant="secondary" onClick={() => setParams({})}>Ir a la última versión</Button> : null}
          </>
        }
      />
      {readOnly && version.status === 'publicado' ? <Alert tone="info">Esta versión está publicada y no se modifica. Para hacer cambios, creá una nueva versión: el paciente seguirá viendo esta hasta que publiques la nueva.</Alert> : null}
      {version.id !== latest.id ? <Alert tone="warn">Estás viendo la versión {version.version_no} ({VSTATUS[version.status].label}). Es de solo lectura.</Alert> : null}

      <div className="editor-grid">
        <div>
          <Card>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Duración">{(id) => (
                <Select id={id} value={content.weeks} disabled={readOnly} onChange={(e) => setWeeks(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w} semana{w > 1 ? 's' : ''}</option>)}
                </Select>
              )}</Field>
              {!plan.is_template ? <Field label="Inicio del ciclo" hint="Para planes de varias semanas">{(id) => <Input id={id} type="date" disabled={readOnly} value={startDate} onChange={(e) => { setStartDate(e.target.value); setDirty(true); }} />}</Field> : null}
              <div className="field">
                <Toggle label="El paciente ve calorías y macros" checked={content.show_nutrients} onChange={(v) => !readOnly && update((c) => (c.show_nutrients = v))} />
              </div>
              {!readOnly ? <div className="field"><Button variant="secondary" className="btn-sm" onClick={() => setMealsOpen(true)}>Comidas y horarios</Button></div> : null}
            </div>
            <Tabs tabs={content.days.map((d) => ({ key: `${d.week}-${d.day}`, label: dayLabel(d, content.weeks).replace('Semana ', 'S') }))} value={dayKey} onChange={setDayKey} />
            <div className="row-between" style={{ marginBottom: '0.6rem' }}>
              <h2 style={{ margin: 0 }}>{dayLabel(day, content.weeks)}</h2>
              {!readOnly ? <Button variant="ghost" className="btn-sm" onClick={() => setCopyOpen(true)}>Copiar este día a…</Button> : null}
            </div>
            {content.meals.map((meal) => {
              const items = day.meals[meal.key] ?? [];
              const t = totals.perMeal[meal.key];
              return (
                <div key={meal.key} className="meal-block">
                  <div className="meal-block-head">
                    <h3 style={{ margin: 0 }}>{meal.name} {meal.time ? <span className="muted small">{meal.time}</span> : null}</h3>
                    {!readOnly ? <Button variant="secondary" className="btn-sm" onClick={() => setPicker({ meal: meal.key })}>+ Agregar alimento</Button> : null}
                  </div>
                  {items.length ? null : <p className="muted small" style={{ margin: '0.4rem 0 0' }}>Sin alimentos.</p>}
                  {items.map((it) => (
                    <div key={it.id}>
                      <ItemEditor
                        item={it}
                        readOnly={readOnly}
                        allergens={allergens}
                        onChange={(n) => update((c) => {
                          const list = c.days.find((x) => `${x.week}-${x.day}` === dayKey)!.meals[meal.key];
                          list[list.findIndex((x) => x.id === it.id)] = n;
                        })}
                        onRemove={() => update((c) => {
                          const d = c.days.find((x) => `${x.week}-${x.day}` === dayKey)!;
                          d.meals[meal.key] = d.meals[meal.key].filter((x) => x.id !== it.id);
                        })}
                      />
                      {(it.alternatives ?? []).map((a) => (
                        <ItemEditor
                          key={a.id}
                          isAlt
                          item={a}
                          readOnly={readOnly}
                          allergens={allergens}
                          onChange={(n) => update((c) => {
                            const x = c.days.find((d) => `${d.week}-${d.day}` === dayKey)!.meals[meal.key].find((y) => y.id === it.id)!;
                            x.alternatives = x.alternatives!.map((y) => (y.id === a.id ? n : y));
                          })}
                          onRemove={() => update((c) => {
                            const x = c.days.find((d) => `${d.week}-${d.day}` === dayKey)!.meals[meal.key].find((y) => y.id === it.id)!;
                            x.alternatives = x.alternatives!.filter((y) => y.id !== a.id);
                          })}
                        />
                      ))}
                      {!readOnly ? <Button variant="ghost" className="btn-sm" onClick={() => setPicker({ meal: meal.key, altOf: it.id })}>+ Alternativa para {it.snapshot?.name}</Button> : null}
                    </div>
                  ))}
                  {items.length ? <div style={{ marginTop: '0.4rem' }}><NutrLine t={t} /></div> : null}
                </div>
              );
            })}
            <Field label="Nota del día (visible para el paciente)">{(id) => <Textarea id={id} disabled={readOnly} value={day.note ?? ''} onChange={(e) => update((c) => (c.days.find((x) => `${x.week}-${x.day}` === dayKey)!.note = e.target.value))} />}</Field>
          </Card>
          <Card title="Indicaciones generales y suplementos">
            <Field label="Indicaciones generales (visibles para el paciente)">{(id) => <Textarea id={id} rows={4} disabled={readOnly} value={content.general_notes} onChange={(e) => update((c) => (c.general_notes = e.target.value))} />}</Field>
            <h3>Suplementos indicados</h3>
            <p className="small muted">Texto registrado por vos. La aplicación no recomienda suplementos.</p>
            {content.supplements.map((s, i) => (
              <div key={i} className="grid-3" style={{ borderTop: '1px solid var(--line)', paddingTop: '0.6rem' }}>
                {(['name', 'dose', 'frequency', 'timing', 'notes'] as const).map((k) => (
                  <Field key={k} label={{ name: 'Suplemento', dose: 'Dosis', frequency: 'Frecuencia', timing: 'Momento', notes: 'Notas' }[k]}>{(id) => <Input id={id} disabled={readOnly} value={s[k]} onChange={(e) => update((c) => (c.supplements[i][k] = e.target.value))} />}</Field>
                ))}
                {!readOnly ? <div className="field"><label>&nbsp;</label><Button variant="ghost" onClick={() => update((c) => c.supplements.splice(i, 1))}>Quitar</Button></div> : null}
              </div>
            ))}
            {!readOnly ? <Button variant="secondary" className="btn-sm" onClick={() => update((c) => c.supplements.push({ name: '', dose: '', frequency: '', timing: '', notes: '' }))}>Agregar suplemento</Button> : null}
          </Card>
        </div>
        <aside className="editor-side stack">
          {plan.patient_id ? (
            <Card title="Para tener en cuenta">
              {allergens.length ? <div className="row" style={{ gap: '0.3rem', marginBottom: '0.5rem' }}>{allergens.map((a) => <Badge key={a} tone="danger">⚠ {ALLERGENS[a]}</Badge>)}</div> : <p className="small muted">Sin alergias registradas.</p>}
              {clinical?.restriction_notes ? <p className="small"><strong>Restricciones:</strong> {clinical.restriction_notes}</p> : null}
              {clinical?.intolerances ? <p className="small"><strong>Intolerancias:</strong> {clinical.intolerances}</p> : null}
              {clinical?.restrictions ? <p className="small"><strong>Otras restricciones:</strong> {clinical.restrictions}</p> : null}
              {clinical?.rejected ? <p className="small"><strong>Rechaza:</strong> {clinical.rejected}</p> : null}
              <Link to={`/pro/pacientes/${plan.patient_id}/historia`} className="small">Ver historia clínica</Link>
            </Card>
          ) : null}
          {localWarnings.size || warnings.length ? (
            <Alert tone="danger">
              <div>
                <strong>Coincidencias con alergias registradas</strong>
                <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>{[...new Set([...localWarnings, ...warnings])].map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            </Alert>
          ) : null}
          <Card title="Total del día">
            <div className="stack" style={{ gap: '0.2rem' }}>
              {NUTRIENTS.map((k) => {
                const goal = target ? target[k] : null;
                const val = totals.total[k];
                const tone = goal && !val.missing ? (Math.abs(val.value - goal) / goal <= 0.05 ? 'var(--primary)' : 'var(--warn)') : undefined;
                return (
                  <div key={k} className="row-between">
                    <span>{NUTRIENT_LABELS[k].label}</span>
                    <span>
                      <strong style={{ color: tone }}>{formatTotal(val, NUTRIENT_LABELS[k].unit, k === 'energy_kcal' ? 0 : 1)}</strong>
                      {goal ? <span className="small muted"> / {goal.toLocaleString('es-AR')}{k === 'energy_kcal' ? '' : ' g'}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
            {plan.patient_id ? (
              target ? (
                <p className="small muted" style={{ marginTop: '0.4rem' }}>
                  Objetivo del paciente según {target.label}. En verde si está dentro del ±5 %. <Link to={`/pro/pacientes/${plan.patient_id}/requerimiento`}>Cambiar</Link>
                </p>
              ) : (
                <p className="small" style={{ marginTop: '0.4rem' }}>
                  <Link to={`/pro/pacientes/${plan.patient_id}/requerimiento`}>Definir requerimiento energético</Link> para comparar con el objetivo.
                </p>
              )
            ) : null}
            {totals.total.errors.length ? <p className="small" style={{ color: 'var(--danger)' }}>{totals.total.errors.join('. ')}</p> : null}
            <p className="small muted" style={{ marginTop: '0.5rem' }}>Calculado con los datos de cada alimento. “Faltan datos” indica valores no disponibles (no se toman como cero).</p>
            {(() => {
              const bases = new Set(Object.values(day.meals).flat().map((it) => it.snapshot?.carbs_basis).filter(Boolean));
              return bases.size > 1 ? <Alert tone="warn">Este día combina carbohidratos totales (tabla de EE.UU., incluyen fibra) y disponibles (etiquetas argentinas, sin fibra): el total de carbohidratos no es homogéneo.</Alert> : null;
            })()}
          </Card>
          <Card title="Acciones">
            <div className="stack" style={{ gap: '0.4rem' }}>
              <Button variant="secondary" onClick={() => openShopping(1)}>Lista de compras</Button>
              <Button variant="secondary" onClick={() => run(() => download(`/api/pro/plans/${planId}/pdf?version=${version.id}`, `plan-v${version.version_no}.pdf`))}>Descargar PDF</Button>
              {plan.patient_id ? <Button variant="secondary" onClick={saveAsTemplate}>Guardar como plantilla</Button> : null}
            </div>
          </Card>
          <Card title="Versiones">
            <ul className="list">
              {versions.map((v: any) => (
                <li key={v.id} className="row-between">
                  <button className="btn btn-ghost btn-sm" onClick={() => setParams(v.id === latest.id ? {} : { version: v.id })} aria-current={v.id === version.id}>
                    v{v.version_no}{v.id === version.id ? ' (viendo)' : ''}
                  </button>
                  <span className="small muted">{VSTATUS[v.status].label}{v.published_at ? ` ${formatDate(v.published_at)}` : ` ${dt(v.updated_at)}`}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      {picker ? <FoodPicker title={picker.altOf ? 'Elegir alternativa' : 'Agregar alimento'} onPick={addFood} onClose={() => setPicker(null)} patientAllergens={allergens} /> : null}
      {confirmPublish ? (
        <Confirm title="Confirmar publicación" danger confirmLabel="Publicar de todos modos" onClose={() => setConfirmPublish(null)} onConfirm={() => publish(true)}>
          <Alert tone="danger">El plan incluye alimentos que coinciden con alergias o intolerancias registradas:</Alert>
          <ul>{confirmPublish.map((w) => <li key={w}>{w}</li>)}</ul>
          <p>Publicá solo si lo revisaste y es una decisión profesional.</p>
        </Confirm>
      ) : null}
      {copyOpen ? <CopyDay content={content} from={day} onClose={() => setCopyOpen(false)} onCopy={(targets) => {
        update((c) => {
          const src = c.days.find((x) => `${x.week}-${x.day}` === dayKey)!;
          for (const t of targets) {
            const d = c.days.find((x) => `${x.week}-${x.day}` === t)!;
            for (const k of Object.keys(src.meals)) d.meals[k] = src.meals[k].map((it) => ({ ...structuredClone(it), id: uid(), alternatives: (it.alternatives ?? []).map((a) => ({ ...structuredClone(a), id: uid() })) }));
          }
        });
        setCopyOpen(false);
        toast(`Día copiado a ${targets.length} día${targets.length > 1 ? 's' : ''}. Recordá guardar.`, 'info');
      }} /> : null}
      {mealsOpen ? <MealsEditor content={content} onClose={() => setMealsOpen(false)} onSave={(meals) => {
        update((c) => {
          c.meals = meals;
          c.days = buildDays(c.weeks, meals, c.days);
        });
        setMealsOpen(false);
      }} /> : null}
      {shopping ? (
        <Modal title={`Lista de compras${shopping.weeks > 1 ? ` · semana ${shopping.week}` : ''}`} onClose={() => setShopping(null)} footer={<Button onClick={() => setShopping(null)}>Cerrar</Button>}>
          {shopping.weeks > 1 ? <Tabs tabs={Array.from({ length: shopping.weeks }, (_, i) => ({ key: String(i + 1), label: `Semana ${i + 1}` }))} value={String(shopping.week)} onChange={(k) => openShopping(Number(k))} /> : null}
          <p className="small muted">Suma las opciones principales (no las alternativas). Solo se suman cantidades compatibles; las recetas se expanden en ingredientes.</p>
          <ShoppingTable data={shopping} />
        </Modal>
      ) : null}
    </>
  );
}

export function ShoppingTable({ data }: { data: any }) {
  if (!data.lines.length) return <p className="muted">No hay alimentos en esta semana.</p>;
  return (
    <>
      <table className="table">
        <tbody>
          {data.lines.map((l: any) => (
            <tr key={`${l.food_id}-${l.unit}`}>
              <td>{l.name}{l.from_recipes.length ? <div className="small muted">para: {l.from_recipes.join(', ')}</div> : null}</td>
              <td className="num">{formatAmount(l.amount, l.unit)}{l.purchase_amount ? <div className="small muted">comprar ≈ {formatAmount(l.purchase_amount, l.unit)} con cáscara/hueso</div> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.issues.map((i: any) => <p key={i.name} className="small" style={{ color: 'var(--danger)' }}>No incluido: {i.name} — {i.reason}</p>)}
    </>
  );
}

function CopyDay({ content, from, onClose, onCopy }: { content: PlanContent; from: PlanDay; onClose: () => void; onCopy: (targets: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const others = content.days.filter((d) => d !== from);
  return (
    <Modal title={`Copiar ${dayLabel(from, content.weeks)}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!sel.length} onClick={() => onCopy(sel)}>Copiar</Button></>}>
      <Alert tone="warn">Reemplaza todas las comidas de los días elegidos.</Alert>
      <Button variant="ghost" className="btn-sm" onClick={() => setSel(others.map((d) => `${d.week}-${d.day}`))}>Seleccionar todos</Button>
      <div className="checks" style={{ flexDirection: 'column' }}>
        {others.map((d) => {
          const k = `${d.week}-${d.day}`;
          return (
            <label key={k}><input type="checkbox" checked={sel.includes(k)} onChange={(e) => setSel(e.target.checked ? [...sel, k] : sel.filter((x) => x !== k))} /> {dayLabel(d, content.weeks)}</label>
          );
        })}
      </div>
    </Modal>
  );
}

function MealsEditor({ content, onClose, onSave }: { content: PlanContent; onClose: () => void; onSave: (m: PlanContent['meals']) => void }) {
  const [meals, setMeals] = useState(structuredClone(content.meals));
  const [err, setErr] = useState('');
  function save() {
    if (!meals.length) return setErr('Tiene que haber al menos una comida');
    if (meals.some((m) => !m.name.trim())) return setErr('Todas las comidas necesitan un nombre');
    onSave(meals);
  }
  return (
    <Modal title="Comidas y horarios" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save}>Aplicar</Button></>}>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      <Alert tone="warn">Quitar una comida elimina sus alimentos en todos los días.</Alert>
      {meals.map((m, i) => (
        <div key={m.key} className="row" style={{ flexWrap: 'nowrap', marginBottom: '0.4rem' }}>
          <Input aria-label="Nombre" value={m.name} onChange={(e) => setMeals(meals.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input aria-label="Horario" type="time" value={m.time} style={{ width: 120 }} onChange={(e) => setMeals(meals.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
          <button className="icon-btn" aria-label="Subir" disabled={!i} onClick={() => { const c = [...meals]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; setMeals(c); }}>↑</button>
          <button className="icon-btn" aria-label="Quitar" onClick={() => setMeals(meals.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <Button variant="secondary" className="btn-sm" onClick={() => setMeals([...meals, { key: `${slug('colacion')}_${uid()}`, name: 'Colación', time: '' }])}>Agregar comida</Button>
    </Modal>
  );
}
