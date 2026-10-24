import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dt, formatDate } from '../../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, FormError, Input, Loading, Modal, PageHeader, Select, Tabs } from '../../components/ui';

export const INVITE: Record<string, { label: string; tone: string }> = {
  aceptada: { label: 'Con acceso', tone: 'ok' },
  pendiente: { label: 'Invitación pendiente', tone: 'warn' },
  vencida: { label: 'Invitación vencida', tone: 'danger' },
  anulada: { label: 'Invitación anulada', tone: 'neutral' },
};

export function PatientsList() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/patients?search=${encodeURIComponent(debounced)}&archived=${archived ? 1 : 0}`);
  const creating = params.get('nuevo') === '1';
  return (
    <>
      <PageHeader title="Pacientes" actions={<Button onClick={() => setParams({ nuevo: '1' })}>Nuevo paciente</Button>} />
      <Card>
        <div className="row-between" style={{ marginBottom: '0.6rem' }}>
          <Input placeholder="Buscar por nombre, apellido o correo" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 380 }} aria-label="Buscar pacientes" />
          <Tabs tabs={[{ key: 'activos', label: 'Activos' }, { key: 'archivados', label: 'Archivados' }]} value={archived ? 'archivados' : 'activos'} onChange={(k) => setArchived(k === 'archivados')} />
        </div>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? (
          <Loading />
        ) : data?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Acceso</th>
                  <th>Plan</th>
                  <th>Próximo turno</th>
                  <th>Mensajes</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/pro/pacientes/${p.id}`} className="name">{p.last_name}, {p.first_name}</Link>
                      <div className="small muted">{p.email ?? 'Sin correo'} · alta {formatDate(p.created_at)}</div>
                    </td>
                    <td>{p.has_account ? <Badge tone="ok">Con acceso</Badge> : p.invitation_status ? <Badge tone={INVITE[p.invitation_status].tone}>{INVITE[p.invitation_status].label}</Badge> : <Badge>Sin invitar</Badge>}</td>
                    <td>{p.has_plan ? <Badge tone="ok">Publicado</Badge> : <span className="muted small">Sin plan publicado</span>}</td>
                    <td className="small">{p.next_appointment ? dt(p.next_appointment) : '—'}</td>
                    <td>{p.unread ? <span className="nav-count">{p.unread}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={debounced ? 'No hay pacientes que coincidan' : archived ? 'No hay pacientes archivados' : 'Todavía no cargaste pacientes'}>
            {!debounced && !archived ? <Button onClick={() => setParams({ nuevo: '1' })}>Cargar el primero</Button> : null}
          </Empty>
        )}
      </Card>
      {creating ? <NewPatient onClose={() => setParams({})} /> : null}
    </>
  );
}

function NewPatient({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', birth_date: '', sex: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await api.post('/api/pro/patients', f);
      nav(`/pro/pacientes/${p.id}/acceso`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Nuevo paciente" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={() => submit()}>Guardar paciente</Button></>}>
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <div className="grid-2">
          <Field label="Nombre" required>{(id) => <Input id={id} value={f.first_name} onChange={set('first_name')} />}</Field>
          <Field label="Apellido" required>{(id) => <Input id={id} value={f.last_name} onChange={set('last_name')} />}</Field>
        </div>
        <Field label="Correo electrónico" hint="Se usa para la invitación. Podés cargarlo después.">{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
        <div className="grid-2">
          <Field label="Teléfono">{(id) => <Input id={id} value={f.phone} onChange={set('phone')} />}</Field>
          <Field label="Fecha de nacimiento">{(id) => <Input id={id} type="date" value={f.birth_date} onChange={set('birth_date')} />}</Field>
        </div>
        <Field label="Sexo">{(id) => (
          <Select id={id} value={f.sex} onChange={set('sex')}>
            <option value="">Sin especificar</option>
            <option value="femenino">Femenino</option>
            <option value="masculino">Masculino</option>
            <option value="otro">Otro</option>
          </Select>
        )}</Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
