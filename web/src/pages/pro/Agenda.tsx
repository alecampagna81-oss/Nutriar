import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { dt, MODALITY, STATUS_APPT, timeOnly } from '../../lib/format';
import { Alert, Badge, Button, Field, FormError, Input, Loading, Modal, PageHeader, Select, Textarea, useAction, ErrorBox } from '../../components/ui';
import { localDate, localDateTime, zonedToUtc } from '@shared/time';
import { WEEKDAYS } from '@shared/nutrition';

function mondayOf(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function Agenda() {
  const { me, emailConfigured } = useAuth();
  const tz = me?.timezone ?? 'America/Argentina/Buenos_Aires';
  const today = localDate(new Date(), tz);
  const [week, setWeek] = useState(mondayOf(today));
  const from = zonedToUtc(`${week}T00:00`, tz).toISOString();
  const to = zonedToUtc(`${addDays(week, 7)}T00:00`, tz).toISOString();
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/appointments?from=${from}&to=${to}`);
  const [edit, setEdit] = useState<any>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={`Zona horaria: ${tz.replace(/_/g, ' ')}`}
        actions={<Button onClick={() => setEdit({ start_local: `${today}T10:00`, minutes: me?.default_appointment_minutes ?? 45, modality: 'presencial', location: '', internal_notes: '', patient_id: '' })}>Nuevo turno</Button>}
      />
      <div className="row-between" style={{ marginBottom: '0.8rem' }}>
        <div className="row">
          <Button variant="secondary" className="btn-sm" onClick={() => setWeek(addDays(week, -7))}>← Semana anterior</Button>
          <Button variant="secondary" className="btn-sm" onClick={() => setWeek(mondayOf(today))}>Hoy</Button>
          <Button variant="secondary" className="btn-sm" onClick={() => setWeek(addDays(week, 7))}>Semana siguiente →</Button>
        </div>
        <strong>{dt(week + 'T12:00:00Z', 'UTC', { day: 'numeric', month: 'long' })} – {dt(addDays(week, 6) + 'T12:00:00Z', 'UTC', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <div className="week-grid">
          {days.map((d, i) => {
            const items = (data ?? []).filter((a) => localDate(a.starts_at, tz) === d);
            return (
              <div key={d} className={`week-day ${d === today ? 'today' : ''}`}>
                <h3>{WEEKDAYS[i]} {Number(d.slice(8))}</h3>
                {items.map((a) => (
                  <button key={a.id} className={`appt st-${a.status}`} onClick={() => setEdit({ ...a, start_local: localDateTime(a.starts_at, tz), minutes: Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000) })}>
                    <strong>{timeOnly(a.starts_at, tz)}</strong> {a.first_name} {a.last_name}
                    <br />
                    <span className="small">{STATUS_APPT[a.status]}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted" style={{ marginTop: '0.8rem' }}>Recordatorios: 24 h antes el paciente recibe un aviso dentro de la aplicación{emailConfigured ? ' y por correo' : ' (el correo no está configurado en este servidor)'}. No hay notificaciones push.</p>
      {edit ? <AppointmentForm appt={edit} tz={tz} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} /> : null}
    </>
  );
}

function AppointmentForm({ appt, tz, onClose, onSaved }: { appt: any; tz: string; onClose: () => void; onSaved: () => void }) {
  const patients = useApi<any[]>('/api/pro/patients');
  const [f, setF] = useState(appt);
  const [error, setError] = useState<unknown>(null);
  const [overlaps, setOverlaps] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { run, busy: busy2 } = useAction();
  async function save(allow = false) {
    setBusy(true);
    setError(null);
    const body = { patient_id: f.patient_id, start_local: f.start_local, minutes: Number(f.minutes), modality: f.modality, location: f.location || null, internal_notes: f.internal_notes ?? '', allow_overlap: allow };
    try {
      if (f.id) await api.put(`/api/pro/appointments/${f.id}`, body);
      else await api.post('/api/pro/appointments', body);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details?.overlaps) setOverlaps(e.details.overlaps);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status: string) {
    if (await run(() => api.post(`/api/pro/appointments/${f.id}/status`, { status }), status === 'cancelado' ? 'Turno cancelado' : 'Estado actualizado')) onSaved();
  }
  const readOnly = f.status === 'cancelado';
  return (
    <Modal
      title={f.id ? 'Turno' : 'Nuevo turno'}
      onClose={onClose}
      footer={
        <>
          {f.id && !readOnly ? <Button variant="ghost" onClick={() => setStatus('cancelado')} busy={busy2}>Cancelar turno</Button> : null}
          {f.id && !readOnly && f.status !== 'realizado' ? <Button variant="ghost" onClick={() => setStatus('realizado')} busy={busy2}>Marcar realizado</Button> : null}
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {!readOnly ? <Button onClick={() => save(false)} busy={busy}>Guardar</Button> : null}
        </>
      }
    >
      <FormError error={error} />
      {f.id ? (
        <p>
          <Link to={`/pro/pacientes/${f.patient_id}`} className="name">{f.first_name} {f.last_name}</Link> <Badge tone={f.status === 'confirmado' ? 'ok' : f.status === 'cambio_solicitado' ? 'warn' : 'neutral'}>{STATUS_APPT[f.status]}</Badge>
        </p>
      ) : (
        <Field label="Paciente" required>{(id) => (
          <Select id={id} value={f.patient_id} onChange={(e) => setF({ ...f, patient_id: e.target.value })}>
            <option value="">Elegí un paciente</option>
            {patients.data?.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
          </Select>
        )}</Field>
      )}
      {f.status === 'cambio_solicitado' && f.patient_note ? <Alert tone="warn">El paciente pidió un cambio: “{f.patient_note}”. Reprogramá el turno y se le avisará.</Alert> : null}
      <div className="grid-2">
        <Field label={`Fecha y hora (${tz.split('/').pop()?.replace(/_/g, ' ')})`}>{(id) => <Input id={id} type="datetime-local" disabled={readOnly} value={f.start_local} onChange={(e) => setF({ ...f, start_local: e.target.value })} />}</Field>
        <Field label="Duración (minutos)">{(id) => <Input id={id} type="number" min={5} max={480} disabled={readOnly} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />}</Field>
        <Field label="Modalidad">{(id) => <Select id={id} disabled={readOnly} value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })}>{Object.entries(MODALITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        <Field label="Lugar o enlace" hint="Visible para el paciente">{(id) => <Input id={id} disabled={readOnly} value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} />}</Field>
      </div>
      <Field label="Notas internas (no las ve el paciente)">{(id) => <Textarea id={id} disabled={readOnly} value={f.internal_notes ?? ''} onChange={(e) => setF({ ...f, internal_notes: e.target.value })} />}</Field>
      {overlaps ? (
        <Alert tone="warn">
          <div>
            <strong>Este horario se superpone con:</strong>
            <ul style={{ margin: '0.3rem 0' }}>{overlaps.map((o) => <li key={o.id}>{o.label}</li>)}</ul>
            <Button variant="secondary" className="btn-sm" onClick={() => save(true)} busy={busy}>Guardar igual (superposición intencional)</Button>
          </div>
        </Alert>
      ) : null}
    </Modal>
  );
}
