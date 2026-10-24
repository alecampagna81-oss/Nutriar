import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { dt, MODALITY, STATUS_APPT, ago } from '../../lib/format';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export function Dashboard() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/api/pro/dashboard');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const tz = data.timezone;
  const followUps = data.questionnaires.length + data.changeRequests.length + data.newLogs.length;
  return (
    <>
      <PageHeader title={`Hola, ${me?.name}`} subtitle={`${data.counts.active} pacientes activos${data.counts.without_access ? ` · ${data.counts.without_access} todavía sin acceso a la aplicación` : ''}`} actions={<Link className="btn btn-primary" to="/pro/pacientes?nuevo=1">Nuevo paciente</Link>} />
      <div className="grid-3">
        <Card title="Próximos turnos (7 días)" actions={<Link to="/pro/agenda" className="btn btn-ghost btn-sm">Ver agenda</Link>}>
          {data.appointments.length ? (
            <ul className="list">
              {data.appointments.map((a: any) => (
                <li key={a.id}>
                  <Link className="list-link" to={`/pro/pacientes/${a.patient_id}`}>
                    <span>
                      <span className="name">{a.first_name} {a.last_name}</span>
                      <br />
                      <span className="small muted">{dt(a.starts_at, tz, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {MODALITY[a.modality]}</span>
                    </span>
                    <Badge tone={a.status === 'confirmado' ? 'ok' : a.status === 'cambio_solicitado' ? 'warn' : 'neutral'}>{STATUS_APPT[a.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Sin turnos esta semana" />
          )}
        </Card>
        <Card title="Mensajes sin leer" actions={<Link to="/pro/mensajes" className="btn btn-ghost btn-sm">Bandeja</Link>}>
          {data.unread.length ? (
            <ul className="list">
              {data.unread.map((u: any) => (
                <li key={u.patient_id}>
                  <Link className="list-link" to={`/pro/pacientes/${u.patient_id}/mensajes`}>
                    <span>
                      <span className="name">{u.first_name} {u.last_name}</span>
                      <br />
                      <span className="small muted">{ago(u.last_at)}</span>
                    </span>
                    <span className="nav-count">{u.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Estás al día" />
          )}
        </Card>
        <Card title={`Seguimientos pendientes${followUps ? ` (${followUps})` : ''}`}>
          {followUps ? (
            <ul className="list">
              {data.changeRequests.map((a: any) => (
                <li key={a.id}>
                  <Link className="list-link" to="/pro/agenda">
                    <span>
                      <span className="name">{a.first_name} {a.last_name}</span> pidió cambiar su turno
                      <br />
                      <span className="small muted">{dt(a.starts_at, tz)} — “{a.patient_note}”</span>
                    </span>
                    <Badge tone="warn">Turno</Badge>
                  </Link>
                </li>
              ))}
              {data.questionnaires.map((q: any) => (
                <li key={q.id}>
                  <Link className="list-link" to={`/pro/pacientes/${q.patient_id}/cuestionarios`}>
                    <span>
                      <span className="name">{q.first_name} {q.last_name}</span> envió su cuestionario
                      <br />
                      <span className="small muted">{ago(q.submitted_at)}</span>
                    </span>
                    <Badge tone="info">Revisar</Badge>
                  </Link>
                </li>
              ))}
              {data.newLogs.map((l: any) => (
                <li key={l.patient_id}>
                  <Link className="list-link" to={`/pro/pacientes/${l.patient_id}/registros`}>
                    <span>
                      <span className="name">{l.first_name} {l.last_name}</span>: {l.count} registro{l.count > 1 ? 's' : ''} de comidas nuevo{l.count > 1 ? 's' : ''}
                    </span>
                    <Badge tone="accent">Registros</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No hay seguimientos pendientes" />
          )}
        </Card>
      </div>
    </>
  );
}
