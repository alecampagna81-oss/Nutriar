import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dt, MODALITY, STATUS_APPT } from '../../lib/format';
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, Textarea, useAction } from '../../components/ui';

export function Appointments() {
  const { data, error, loading, reload } = useApi<any>('/api/me/appointments');
  const [change, setChange] = useState<any>(null);
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const now = Date.now();
  const upcoming = data.appointments.filter((a: any) => new Date(a.starts_at).getTime() > now);
  const past = data.appointments.filter((a: any) => new Date(a.starts_at).getTime() <= now).reverse();
  async function confirm(a: any) {
    if (await run(() => api.post(`/api/me/appointments/${a.id}/confirm`), 'Turno confirmado')) reload();
  }
  async function requestChange() {
    if (await run(() => api.post(`/api/me/appointments/${change.id}/request-change`, { note }), 'Pedido de cambio enviado')) {
      setChange(null);
      setNote('');
      reload();
    }
  }
  const tone = (s: string) => (s === 'confirmado' ? 'ok' : s === 'cambio_solicitado' ? 'warn' : s === 'cancelado' ? 'danger' : 'neutral');
  return (
    <>
      <h1>Mis turnos</h1>
      <Card title="Próximos">
        {upcoming.length ? (
          <ul className="list">
            {upcoming.map((a: any) => (
              <li key={a.id}>
                <div className="row-between">
                  <strong>{dt(a.starts_at, data.timezone, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</strong>
                  <Badge tone={tone(a.status)}>{STATUS_APPT[a.status]}</Badge>
                </div>
                <div className="small muted">{MODALITY[a.modality]}{a.location ? ` · ${a.location}` : ''}</div>
                {a.patient_note && a.status === 'cambio_solicitado' ? <div className="small">Tu pedido: “{a.patient_note}”</div> : null}
                {a.status !== 'cancelado' ? (
                  <div className="row" style={{ marginTop: '0.4rem' }}>
                    {a.status !== 'confirmado' ? <Button className="btn-sm" onClick={() => confirm(a)} busy={busy}>Confirmar asistencia</Button> : null}
                    {a.status !== 'cambio_solicitado' ? <Button variant="secondary" className="btn-sm" onClick={() => setChange(a)}>Pedir cambio</Button> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No tenés turnos próximos.</p>
        )}
      </Card>
      {past.length ? (
        <Card title="Anteriores">
          <ul className="list">{past.map((a: any) => <li key={a.id} className="row-between"><span>{dt(a.starts_at, data.timezone)}</span><Badge tone={tone(a.status)}>{STATUS_APPT[a.status]}</Badge></li>)}</ul>
        </Card>
      ) : null}
      <p className="small muted">Recibís un aviso dentro de la aplicación 24 horas antes del turno.</p>
      {change ? (
        <Modal title="Pedir cambio de turno" onClose={() => setChange(null)} footer={<><Button variant="secondary" onClick={() => setChange(null)}>Cancelar</Button><Button onClick={requestChange} busy={busy} disabled={note.trim().length < 3}>Enviar pedido</Button></>}>
          <p>Tu nutricionista va a recibir el pedido y te va a proponer otro horario.</p>
          <Field label="¿Qué días u horarios te quedan mejor?">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </Modal>
      ) : null}
    </>
  );
}
