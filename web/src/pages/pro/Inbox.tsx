import { Link } from 'react-router-dom';
import { useApi, useInterval } from '../../lib/hooks';
import { ago } from '../../lib/format';
import { Card, Empty, ErrorBox, Loading, PageHeader } from '../../components/ui';

export function Inbox() {
  const { data, error, loading, reload } = useApi<any[]>('/api/pro/messages');
  useInterval(reload, 30000);
  return (
    <>
      <PageHeader title="Mensajes" subtitle="Conversaciones privadas con tus pacientes. Configurá tus horarios de respuesta en Configuración." />
      <Card>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : data?.length ? (
          <ul className="list">
            {data.map((c) => (
              <li key={c.patient_id}>
                <Link className="list-link" to={`/pro/pacientes/${c.patient_id}/mensajes`}>
                  <span style={{ minWidth: 0 }}>
                    <span className="name">{c.first_name} {c.last_name}</span>
                    <br />
                    <span className="small muted" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60vw' }}>
                      {c.last_mine ? 'Vos: ' : ''}{c.last_body || (c.last_has_file ? '[imagen]' : '')}
                    </span>
                  </span>
                  <span className="row" style={{ flexWrap: 'nowrap' }}>
                    <span className="small muted nowrap">{ago(c.last_at)}</span>
                    {c.unread ? <span className="nav-count">{c.unread}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Todavía no hay conversaciones">Podés escribirle a un paciente desde su ficha, pestaña Mensajes.</Empty>
        )}
      </Card>
    </>
  );
}
