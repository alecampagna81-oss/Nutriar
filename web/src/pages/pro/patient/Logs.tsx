import { useApi } from '../../../lib/hooks';
import { dt, formatDate, MEAL_STATUS } from '../../../lib/format';
import { Badge, Card, Empty, ErrorBox, Loading, PrivateImage } from '../../../components/ui';

const TONE: Record<string, string> = { cumplida: 'ok', parcial: 'warn', no_cumplida: 'danger', fuera_del_plan: 'accent' };

export function Logs({ patientId }: { patientId: string }) {
  const { data, error, loading, reload } = useApi<any>(`/api/pro/patients/${patientId}/logs`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const habitTotals = new Map<string, number>();
  for (const h of data.habits) habitTotals.set(`${h.log_date}|${h.habit_key}`, (habitTotals.get(`${h.log_date}|${h.habit_key}`) ?? 0) + h.value);
  const habitDays = [...new Set(data.habits.map((h: any) => h.log_date))].slice(0, 14) as string[];
  return (
    <>
      <Card title="Registro de comidas">
        {data.meals.length ? (
          <ul className="list">
            {data.meals.map((m: any) => (
              <li key={m.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                {m.photo_url ? <a href={m.photo_url} target="_blank" rel="noreferrer"><PrivateImage src={m.photo_url} alt={`Foto de ${m.meal_name}`} className="thumb" /></a> : null}
                <div style={{ flex: 1 }}>
                  <div className="row-between">
                    <strong>{formatDate(m.log_date)} · {m.meal_name}</strong>
                    <Badge tone={TONE[m.status]}>{MEAL_STATUS[m.status]}</Badge>
                  </div>
                  {m.description ? <p>{m.description}</p> : null}
                  {m.comment ? <p className="small">Comentario: {m.comment}</p> : null}
                  {m.difficulty ? <p className="small">Dificultad: {m.difficulty}</p> : null}
                  <div className="small muted">Cargado {dt(m.created_at)}{m.plan_title ? ` · plan “${m.plan_title}” v${m.version_no}` : ' · sin plan vigente'}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="El paciente todavía no registró comidas" />
        )}
      </Card>
      <Card title="Agua y hábitos (últimos días)">
        {habitDays.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha</th>{data.habit_defs.map((h: any) => <th key={h.key} className="num">{h.name} ({h.unit}){h.target ? ` · meta ${h.target}` : ''}</th>)}</tr></thead>
              <tbody>
                {habitDays.map((d) => (
                  <tr key={d}><td>{formatDate(d)}</td>{data.habit_defs.map((h: any) => <td key={h.key} className="num">{habitTotals.get(`${d}|${h.key}`) ?? '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin registros de hábitos" />
        )}
      </Card>
    </>
  );
}
