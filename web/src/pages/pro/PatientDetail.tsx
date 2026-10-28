import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { Badge, ErrorBox, Loading, PageHeader, Tabs } from '../../components/ui';
import { ALLERGENS } from '@shared/nutrition';
import { Summary } from './patient/Summary';
import { Clinical } from './patient/Clinical';
import { Questionnaires } from './patient/Questionnaires';
import { Consultations } from './patient/Consultations';
import { Measurements } from './patient/Measurements';
import { Energy } from './patient/Energy';
import { Photos } from './patient/Photos';
import { Plans } from './patient/Plans';
import { Logs } from './patient/Logs';
import { Documents } from './patient/Documents';
import { Access } from './patient/Access';
import { Chat } from '../../components/Chat';
import { INVITE } from './Patients';

const TABS = [
  ['resumen', 'Resumen'],
  ['historia', 'Historia clínica'],
  ['cuestionarios', 'Cuestionarios'],
  ['consultas', 'Consultas'],
  ['mediciones', 'Mediciones'],
  ['requerimiento', 'Requerimiento'],
  ['fotos', 'Fotos'],
  ['planes', 'Planes'],
  ['registros', 'Registros'],
  ['mensajes', 'Mensajes'],
  ['documentos', 'Documentos'],
  ['acceso', 'Acceso y configuración'],
];

export function PatientDetail() {
  const { id = '', tab = 'resumen' } = useParams();
  const nav = useNavigate();
  const { data: p, error, loading, reload } = useApi<any>(`/api/pro/patients/${id}`);
  if (loading && !p) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const inv = p.user_id ? { label: 'Con acceso', tone: 'ok' } : p.invitation ? INVITE[p.invitation.status] : { label: 'Sin invitar', tone: 'neutral' };
  const base = `/api/pro/patients/${id}`;
  return (
    <>
      <PageHeader
        back={<Link to="/pro/pacientes" className="small">← Pacientes</Link>}
        title={`${p.first_name} ${p.last_name}`}
        subtitle={
          <span className="row" style={{ gap: '0.4rem' }}>
            <Badge tone={inv.tone}>{inv.label}</Badge>
            {p.archived_at ? <Badge tone="danger">Archivado</Badge> : null}
            {p.allergens.map((a: string) => (
              <Badge key={a} tone="danger" title="Alergia o intolerancia registrada">⚠ {ALLERGENS[a] ?? a}</Badge>
            ))}
          </span>
        }
      />
      <Tabs tabs={TABS.map(([key, label]) => ({ key, label }))} value={tab} onChange={(k) => nav(`/pro/pacientes/${id}/${k}`)} />
      {tab === 'resumen' && <Summary patient={p} />}
      {tab === 'historia' && <Clinical patientId={id} onSaved={reload} />}
      {tab === 'cuestionarios' && <Questionnaires patientId={id} hasAccount={!!p.user_id} />}
      {tab === 'consultas' && <Consultations patientId={id} />}
      {tab === 'mediciones' && <Measurements patient={p} onSettingsChanged={reload} />}
      {tab === 'requerimiento' && <Energy patientId={id} />}
      {tab === 'fotos' && <Photos patientId={id} />}
      {tab === 'planes' && <Plans patient={p} />}
      {tab === 'registros' && <Logs patientId={id} />}
      {tab === 'mensajes' && (
        <div className="card">
          {!p.user_id ? <p className="alert alert-info">El paciente todavía no activó su acceso: verá los mensajes cuando lo haga.</p> : null}
          <Chat url={`${base}/messages`} emptyText="Todavía no hay mensajes con este paciente." />
        </div>
      )}
      {tab === 'documentos' && <Documents patientId={id} />}
      {tab === 'acceso' && <Access patient={p} reload={reload} />}
    </>
  );
}
