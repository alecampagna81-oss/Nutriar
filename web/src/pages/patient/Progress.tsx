import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { formatDate } from '../../lib/format';
import { Badge, Card, ErrorBox, Loading } from '../../components/ui';
import { LineChart } from '../../components/LineChart';
import { DERIVED } from '@shared/measures';

export function Progress() {
  const { data, error, loading, reload } = useApi<any>('/api/me/progress');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const kinds = data.kinds.filter((k: any) => data.rows.some((r: any) => r.kind === k.key));
  return (
    <>
      <h1>Mis avances</h1>
      {data.goals.length ? (
        <Card title="Objetivos">
          <ul className="list">
            {data.goals.map((g: any) => (
              <li key={g.id} className="row-between">
                <span>{g.description}{g.target ? <span className="muted"> — {g.target}</span> : null}</span>
                <Badge tone={g.status === 'logrado' ? 'ok' : g.status === 'pausado' ? 'neutral' : 'info'}>{g.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {kinds.map((k: any) => (
        <Card key={k.key} title={`${k.label} (${k.unit})`}>
          <LineChart label={k.label} unit={k.unit} points={data.rows.filter((r: any) => r.kind === k.key).map((r: any) => ({ date: r.measured_on, value: r.value, source: r.source }))} />
        </Card>
      ))}
      {Object.entries(data.derived).map(([key, pts]: [string, any]) => {
        const d = DERIVED.find((x) => x.key === key)!;
        return pts.length ? (
          <Card key={key} title={d.label}>
            <LineChart label={d.label} unit={d.unit} points={pts.map((p: any) => ({ date: p.measured_on, value: p.value, source: 'calculado' }))} />
          </Card>
        ) : null;
      })}
      {!kinds.length ? (
        <Card>
          <p style={{ margin: 0 }}>Todavía no hay mediciones para mostrar. {data.allow_self_measurements ? <Link to="/app/registrar?tab=medidas">Cargá tu peso o medidas</Link> : 'Tu nutricionista te las va a compartir cuando corresponda.'}</p>
        </Card>
      ) : null}
      {data.notes.length ? (
        <Card title="Indicaciones de tus consultas">
          <ul className="list">
            {data.notes.map((n: any) => <li key={n.id}><strong>{formatDate(n.date)} · {n.title}</strong><p style={{ whiteSpace: 'pre-wrap', margin: '0.3rem 0 0' }}>{n.shared_notes}</p></li>)}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
