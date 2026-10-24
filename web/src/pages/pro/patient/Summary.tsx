import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../../lib/hooks';
import { dt, formatDate, MODALITY, STATUS_APPT } from '../../../lib/format';
import { Badge, Card, Empty } from '../../../components/ui';

export function Summary({ patient: p }: { patient: any }) {
  const plans = useApi<any[]>(`/api/pro/patients/${p.id}/plans`);
  const [from] = useState(() => new Date(Date.now() - 86400000).toISOString());
  const appts = useApi<any[]>(`/api/pro/appointments?patient_id=${p.id}&from=${from}`);
  const goals = useApi<any[]>(`/api/pro/patients/${p.id}/goals`);
  const active = plans.data?.find((pl) => pl.versions?.some((v: any) => v.status === 'publicado'));
  const age = p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date + 'T12:00:00Z').getTime()) / (365.25 * 86400000)) : null;
  return (
    <div className="grid-2">
      <Card title="Datos" actions={<Link className="btn btn-ghost btn-sm" to={`/pro/pacientes/${p.id}/acceso`}>Editar</Link>}>
        <dl className="kv">
          <dt>Correo</dt><dd>{p.email ?? '—'}</dd>
          <dt>Teléfono</dt><dd>{p.phone ?? '—'}</dd>
          <dt>Nacimiento</dt><dd>{p.birth_date ? `${formatDate(p.birth_date)} (${age} años)` : '—'}</dd>
          <dt>Sexo</dt><dd>{p.sex ?? '—'}</dd>
          <dt>Restricciones</dt><dd>{p.restriction_notes || '—'}</dd>
        </dl>
      </Card>
      <Card title="Plan vigente" actions={<Link className="btn btn-ghost btn-sm" to={`/pro/pacientes/${p.id}/planes`}>Planes</Link>}>
        {active ? (
          <p>
            <Link to={`/pro/planes/${active.id}`} className="name">{active.title}</Link>{' '}
            <Badge tone="ok">v{active.versions.find((v: any) => v.status === 'publicado').version_no} publicada</Badge>
          </p>
        ) : (
          <Empty title="Sin plan publicado" />
        )}
      </Card>
      <Card title="Próximos turnos" actions={<Link className="btn btn-ghost btn-sm" to="/pro/agenda">Agenda</Link>}>
        {appts.data?.filter((a) => a.status !== 'cancelado').length ? (
          <ul className="list">
            {appts.data.filter((a) => a.status !== 'cancelado').map((a) => (
              <li key={a.id} className="row-between">
                <span>{dt(a.starts_at)} · {MODALITY[a.modality]}</span>
                <Badge tone={a.status === 'confirmado' ? 'ok' : a.status === 'cambio_solicitado' ? 'warn' : 'neutral'}>{STATUS_APPT[a.status]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Sin turnos próximos" />
        )}
      </Card>
      <Card title="Objetivos" actions={<Link className="btn btn-ghost btn-sm" to={`/pro/pacientes/${p.id}/mediciones`}>Gestionar</Link>}>
        {goals.data?.length ? (
          <ul className="list">
            {goals.data.map((g) => (
              <li key={g.id} className="row-between">
                <span>{g.description}{g.target ? <span className="muted"> — {g.target}</span> : null}</span>
                <Badge tone={g.status === 'logrado' ? 'ok' : g.status === 'pausado' ? 'neutral' : 'info'}>{g.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Sin objetivos cargados" />
        )}
      </Card>
    </div>
  );
}
