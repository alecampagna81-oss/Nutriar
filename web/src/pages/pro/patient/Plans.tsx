import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { dt } from '../../../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Select, useAction } from '../../../components/ui';

export const VSTATUS: Record<string, { label: string; tone: string }> = { borrador: { label: 'Borrador', tone: 'warn' }, publicado: { label: 'Publicado', tone: 'ok' }, reemplazado: { label: 'Reemplazado', tone: 'neutral' } };

export function NewPlanModal({ patientId, onClose, initialFrom }: { patientId: string | null; onClose: () => void; initialFrom?: string }) {
  const nav = useNavigate();
  const templates = useApi<any[]>('/api/pro/templates');
  const [f, setF] = useState({ title: patientId ? 'Plan alimentario' : 'Nueva plantilla', weeks: 1, from_plan_id: initialFrom ?? '' });
  const { busy, run } = useAction();
  async function create() {
    const r = await run(() => api.post('/api/pro/plans', { title: f.title, weeks: f.weeks, patient_id: patientId, from_plan_id: f.from_plan_id || null }));
    if (r) nav(`/pro/planes/${r.id}`);
  }
  return (
    <Modal title={patientId ? 'Nuevo plan' : 'Nueva plantilla'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={create} busy={busy}>Crear y editar</Button></>}>
      <Field label="Título" required>{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
      <Field label="Partir de">{(id) => (
        <Select id={id} value={f.from_plan_id} onChange={(e) => setF({ ...f, from_plan_id: e.target.value })}>
          <option value="">Plan en blanco</option>
          {initialFrom && !templates.data?.some((t) => t.id === initialFrom) ? <option value={initialFrom}>Copia del plan seleccionado</option> : null}
          {templates.data?.map((t) => <option key={t.id} value={t.id}>Plantilla: {t.title}</option>)}
        </Select>
      )}</Field>
      {!f.from_plan_id ? (
        <Field label="Duración">{(id) => (
          <Select id={id} value={f.weeks} onChange={(e) => setF({ ...f, weeks: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w} semana{w > 1 ? 's' : ''}</option>)}
          </Select>
        )}</Field>
      ) : null}
    </Modal>
  );
}

export function Plans({ patient }: { patient: any }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/patients/${patient.id}/plans`);
  const [creating, setCreating] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  return (
    <Card title="Planes alimentarios" actions={<Button onClick={() => setCreating('')}>Nuevo plan</Button>}>
      <ErrorBox error={error} onRetry={reload} />
      <p className="small muted">El paciente ve solo la versión publicada vigente. Publicar una versión nueva reemplaza a la anterior sin borrar el historial ni los registros.</p>
      {data?.length ? (
        <ul className="list">
          {data.map((pl) => {
            const current = pl.versions?.[0];
            return (
              <li key={pl.id}>
                <div className="row-between">
                  <span>
                    <Link to={`/pro/planes/${pl.id}`} className="name">{pl.title}</Link>
                    {pl.archived_at ? <Badge>Archivado</Badge> : null}
                    <br />
                    <span className="small muted">Creado {dt(pl.created_at)}</span>
                  </span>
                  <span className="row">
                    {pl.versions?.map((v: any) => (
                      <Badge key={v.id} tone={VSTATUS[v.status].tone} title={v.published_at ? `Publicada ${dt(v.published_at)}` : undefined}>v{v.version_no} {VSTATUS[v.status].label}</Badge>
                    ))}
                    <Button variant="ghost" className="btn-sm" onClick={() => setCreating(pl.id)}>Duplicar</Button>
                    <Link to={`/pro/planes/${pl.id}`} className="btn btn-secondary btn-sm">{current?.status === 'borrador' ? 'Editar' : 'Abrir'}</Link>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="Todavía no hay planes para este paciente" />
      )}
      {creating !== null ? <NewPlanModal patientId={patient.id} initialFrom={creating || undefined} onClose={() => setCreating(null)} /> : null}
    </Card>
  );
}
