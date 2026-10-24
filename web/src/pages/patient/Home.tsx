import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dt, MODALITY, STATUS_APPT } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { Alert, Badge, Button, Card, ErrorBox, Loading, useAction } from '../../components/ui';
import { dayLabel, planDayForDate } from '@shared/nutrition';
import { MealCard } from './Plan';

export function HabitCounter({ habit, total, date, onChanged }: { habit: any; total: number; date: string; onChanged: () => void }) {
  const { busy, run } = useAction();
  async function add(v: number) {
    if (await run(() => api.post('/api/me/habit-logs', { log_date: date, habit_key: habit.key, value: v }))) onChanged();
  }
  return (
    <div className="row-between" style={{ padding: '0.4rem 0' }}>
      <span>
        <strong>{habit.name}</strong>
        <br />
        <span className="small muted">{habit.target ? `Meta: ${habit.target} ${habit.unit}` : habit.unit}</span>
      </span>
      <span className="water">
        <Button variant="secondary" aria-label={`Restar 1 ${habit.unit}`} onClick={() => add(-1)} disabled={busy || total <= 0}>−</Button>
        <span className="count" aria-live="polite">{total}</span>
        <Button aria-label={`Sumar 1 ${habit.unit}`} onClick={() => add(1)} disabled={busy}>+</Button>
      </span>
    </div>
  );
}

export function Home() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/api/me/home');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const plan = data.plan;
  const day = plan ? planDayForDate(plan.content, plan.start_date, data.today) : null;
  const logged = new Set(data.logs_today.map((l: any) => l.meal_key));
  const habitTotal = (k: string) => data.habits_today.find((h: any) => h.habit_key === k)?.total ?? 0;
  return (
    <>
      <h1>Hola, {me?.first_name}</h1>
      {data.pending_questionnaire ? (
        <Alert tone="warn">
          <span>Tu nutricionista te pidió completar el cuestionario previo.</span>
          <Link to="/app/cuestionario" className="btn btn-primary btn-sm">Completar</Link>
        </Alert>
      ) : null}
      {data.next_appointment ? (
        <Card title="Próximo turno" actions={<Link to="/app/turnos" className="btn btn-ghost btn-sm">Ver</Link>}>
          <p style={{ margin: 0 }}>
            {dt(data.next_appointment.starts_at, data.timezone, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · {MODALITY[data.next_appointment.modality]}
            <br />
            <Badge tone={data.next_appointment.status === 'confirmado' ? 'ok' : 'warn'}>{STATUS_APPT[data.next_appointment.status]}</Badge>
          </p>
        </Card>
      ) : null}
      {data.habit_defs.length ? (
        <Card title="Hoy">
          {data.habit_defs.map((h: any) => <HabitCounter key={h.key} habit={h} total={habitTotal(h.key)} date={data.today} onChanged={reload} />)}
        </Card>
      ) : null}
      <div style={{ marginTop: '1rem' }}>
        {plan && day ? (
          <>
            <div className="row-between">
              <h2 style={{ margin: 0 }}>Tu plan de hoy</h2>
              <span className="small muted">{dayLabel(day, plan.content.weeks)}</span>
            </div>
            <p className="small muted">Tocá “Registrar” en cada comida para contarle a tu nutricionista cómo te fue.</p>
            {plan.content.meals.map((m: any) =>
              (day.meals[m.key] ?? []).length ? (
                <MealCard key={m.key} meal={m} items={day.meals[m.key]} showNutrients={plan.content.show_nutrients} footer={
                  logged.has(m.key) ? <Badge tone="ok">✓ Registrada</Badge> : <Link className="btn btn-secondary btn-sm" to={`/app/registrar?comida=${m.key}`}>Registrar</Link>
                } />
              ) : null,
            )}
          </>
        ) : (
          <Card>
            <p style={{ margin: 0 }}>Tu nutricionista todavía no publicó tu plan alimentario. Cuando lo haga, lo vas a ver acá.</p>
          </Card>
        )}
      </div>
      <div className="big-actions" style={{ marginTop: '1rem' }}>
        <Link to="/app/compras" className="big-action">Lista de compras<span>De tu plan semanal</span></Link>
        <Link to="/app/turnos" className="big-action">Turnos<span>Confirmar o pedir cambio</span></Link>
      </div>
    </>
  );
}
