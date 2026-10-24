import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { download } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { formatDate, num, todayIn } from '../../lib/format';
import { Alert, Button, Card, ErrorBox, Loading, Modal, useAction } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { dayLabel, dayTotals, describeQuantity, formatTotal, itemNutrients, NUTRIENT_LABELS, NUTRIENTS, planDayForDate, type PlanItem } from '@shared/nutrition';

function RecipeModal({ item, onClose }: { item: PlanItem; onClose: () => void }) {
  const s = item.snapshot!;
  const r = s.recipe!;
  const portions = item.unit === 'porcion' ? Number(item.quantity) : null;
  const factor = item.unit === 'porcion' ? Number(item.quantity) / r.servings : null;
  return (
    <Modal title={s.name} onClose={onClose}>
      <p className="small muted">La receta completa rinde {num(r.servings, 0)} porciones ({num(r.yield_grams, 0)} g). {portions ? `A vos te corresponde${portions === 1 ? '' : 'n'} ${num(portions, 1)}.` : ''}</p>
      <h3>Ingredientes (receta completa)</h3>
      <ul>
        {r.ingredients.map((i) => (
          <li key={i.food_id}>{i.name}: {num(i.amount, 0)} {i.unit}{factor ? <span className="muted small"> (para tu porción: {num(i.amount * factor, 0)} {i.unit})</span> : null}</li>
        ))}
      </ul>
      <h3>Preparación</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{r.preparation || 'Sin indicaciones de preparación.'}</p>
    </Modal>
  );
}

function ItemLine({ it, showNutrients, onRecipe }: { it: PlanItem; showNutrients: boolean; onRecipe: (i: PlanItem) => void }) {
  const s = it.snapshot!;
  const n = showNutrients ? itemNutrients(it, s) : null;
  return (
    <div>
      <div>
        <strong>{describeQuantity(it, s)}</strong> de {s.name}
        {s.brand ? <span className="muted"> ({s.brand})</span> : null}
        {it.gross ? <span className="small muted"> · peso con cáscara/hueso</span> : null}
      </div>
      {it.note ? <div className="small">{it.note}</div> : null}
      {s.recipe ? <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => onRecipe(it)}>Ver receta</button> : null}
      {n && n.energy_kcal !== null ? <div className="small muted">{num(n.energy_kcal, 0)} kcal</div> : null}
    </div>
  );
}

export function MealCard({ meal, items, showNutrients, footer }: { meal: { key: string; name: string; time: string }; items: PlanItem[]; showNutrients: boolean; footer?: ReactNode }) {
  const [recipe, setRecipe] = useState<PlanItem | null>(null);
  return (
    <section className="meal-card">
      <h3>
        <span>{meal.name}</span>
        <span className="small muted">{meal.time}</span>
      </h3>
      {items.map((it) => (
        <div className="meal-item" key={it.id}>
          <ItemLine it={it} showNutrients={showNutrients} onRecipe={setRecipe} />
          {it.alternatives?.length ? (
            <div className="alt">
              <span className="small">Opciones que te autorizó tu nutricionista en lugar de esto:</span>
              {it.alternatives.map((a) => <ItemLine key={a.id} it={a as PlanItem} showNutrients={showNutrients} onRecipe={setRecipe} />)}
            </div>
          ) : null}
        </div>
      ))}
      {footer ? <div style={{ marginTop: '0.5rem' }}>{footer}</div> : null}
      {recipe ? <RecipeModal item={recipe} onClose={() => setRecipe(null)} /> : null}
    </section>
  );
}

export function PlanView() {
  const { data, error, loading, reload } = useApi<any>('/api/me/plan');
  const { me } = useAuth();
  const today = todayIn(me?.timezone);
  const [sel, setSel] = useState<string | null>(null);
  const { busy, run } = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Card><p style={{ margin: 0 }}>Todavía no tenés un plan publicado. Tu nutricionista te va a avisar cuando esté listo.</p></Card>;
  const c = data.content;
  const todayDay = planDayForDate(c, data.start_date, today);
  const key = sel ?? (todayDay ? `${todayDay.week}-${todayDay.day}` : '1-1');
  const day = c.days.find((d: any) => `${d.week}-${d.day}` === key) ?? c.days[0];
  const totals = c.show_nutrients ? dayTotals(day, c.meals.map((m: any) => m.key)) : null;
  return (
    <>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>{data.title}</h1>
        <Button variant="secondary" className="btn-sm" busy={busy} onClick={() => run(() => download('/api/me/plan/pdf', 'mi-plan.pdf'))}>Descargar PDF</Button>
      </div>
      <p className="small muted">Versión {data.version_no} · publicada el {formatDate(data.published_at)}</p>
      <div className="day-strip" role="tablist" aria-label="Días del plan">
        {c.days.map((d: any) => {
          const k = `${d.week}-${d.day}`;
          const isToday = todayDay && k === `${todayDay.week}-${todayDay.day}`;
          return (
            <button key={k} role="tab" aria-selected={k === key} className={`day-chip ${k === key ? 'active' : ''}`} onClick={() => setSel(k)}>
              {dayLabel(d, c.weeks).replace('Semana ', 'S').replace(' · ', ' ')}{isToday ? ' (hoy)' : ''}
            </button>
          );
        })}
      </div>
      {day.note ? <Alert tone="info">{day.note}</Alert> : null}
      {c.meals.map((m: any) => ((day.meals[m.key] ?? []).length ? <MealCard key={m.key} meal={m} items={day.meals[m.key]} showNutrients={c.show_nutrients} /> : null))}
      {totals ? (
        <Card title="Total del día">
          {NUTRIENTS.map((k) => <div key={k} className="row-between"><span>{NUTRIENT_LABELS[k].label}</span><strong>{formatTotal(totals.total[k], NUTRIENT_LABELS[k].unit, k === 'energy_kcal' ? 0 : 1)}</strong></div>)}
        </Card>
      ) : null}
      {c.general_notes ? <Card title="Indicaciones generales"><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{c.general_notes}</p></Card> : null}
      {c.supplements.length ? (
        <Card title="Suplementos indicados por tu nutricionista">
          <ul className="list">{c.supplements.map((s: any, i: number) => <li key={i}><strong>{s.name}</strong>{[s.dose, s.frequency, s.timing].filter(Boolean).length ? ` — ${[s.dose, s.frequency, s.timing].filter(Boolean).join(' · ')}` : ''}{s.notes ? <div className="small muted">{s.notes}</div> : null}</li>)}</ul>
        </Card>
      ) : null}
      <div style={{ marginTop: '1rem' }}>
        <Link to="/app/compras" className="btn btn-secondary" style={{ width: '100%' }}>Ver lista de compras</Link>
      </div>
    </>
  );
}
