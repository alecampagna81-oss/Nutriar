import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { Alert, Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea, useAction } from '../../components/ui';
import { ChangePassword } from '../../components/ChangePassword';

const TZS = ['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba', 'America/Argentina/Mendoza', 'America/Argentina/Salta', 'America/Argentina/Ushuaia', 'America/Montevideo', 'America/Santiago', 'America/Asuncion', 'Europe/Madrid'];
const KIND: Record<string, string> = { texto: 'Texto libre', si_no: 'Sí / No', numero: 'Número', opciones: 'Opciones' };

export function Settings() {
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/api/pro/settings');
  const [f, setF] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (data) setF({ name: data.name, license_number: data.license_number ?? '', timezone: data.timezone, response_hours: data.response_hours, default_appointment_minutes: data.default_appointment_minutes });
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !f) return <Loading />;
  async function save() {
    if (await run(() => api.put('/api/pro/settings', f), 'Configuración guardada')) {
      reload();
      refresh();
    }
  }
  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid-2">
        <Card title="Perfil y consulta">
          <Field label="Nombre visible">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Matrícula">{(id) => <Input id={id} value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} />}</Field>
          <Field label="Zona horaria">{(id) => <Select id={id} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{TZS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select>}</Field>
          <Field label="Duración habitual del turno (minutos)">{(id) => <Input id={id} type="number" value={f.default_appointment_minutes} onChange={(e) => setF({ ...f, default_appointment_minutes: e.target.value })} />}</Field>
          <Field label="Horarios de respuesta de mensajes" hint="Se muestra a tus pacientes junto con el aviso de que la mensajería no es para urgencias.">{(id) => <Textarea id={id} value={f.response_hours} onChange={(e) => setF({ ...f, response_hours: e.target.value })} />}</Field>
          <Button onClick={save} busy={busy}>Guardar</Button>
        </Card>
        <div>
          <Questions />
          <Card title="Servicios externos">
            <p>Correo electrónico: {data.email_configured ? <Badge tone="ok">Configurado</Badge> : <Badge tone="warn">No configurado</Badge>}</p>
            <p className="small muted">Sin correo, las invitaciones y el restablecimiento de contraseñas se hacen copiando el enlace. Las notificaciones push no están disponibles en esta versión.</p>
          </Card>
          <ChangePassword />
        </div>
      </div>
    </>
  );
}

function Questions() {
  const { data, reload } = useApi<any[]>('/api/pro/questions');
  const [q, setQ] = useState({ text: '', kind: 'texto', options: '' });
  const { busy, run } = useAction();
  async function add() {
    if (await run(() => api.post('/api/pro/questions', { text: q.text, kind: q.kind, options: q.kind === 'opciones' ? q.options.split('\n').map((s) => s.trim()).filter(Boolean) : [] }), 'Pregunta agregada')) {
      setQ({ text: '', kind: 'texto', options: '' });
      reload();
    }
  }
  async function toggle(x: any) {
    if (await run(() => api.patch(`/api/pro/questions/${x.id}`, { active: !x.active }))) reload();
  }
  return (
    <Card title="Preguntas adicionales del cuestionario">
      <Alert tone="info">Se suman a las preguntas base y al registro de 24 h cuando solicitás un cuestionario.</Alert>
      <ul className="list">
        {data?.map((x) => (
          <li key={x.id} className="row-between">
            <span>{x.text} <span className="small muted">({KIND[x.kind]}{x.options.length ? `: ${x.options.join(', ')}` : ''})</span></span>
            <Button variant="ghost" className="btn-sm" onClick={() => toggle(x)}>{x.active ? 'Desactivar' : 'Activar'}</Button>
          </li>
        ))}
      </ul>
      <Field label="Nueva pregunta">{(id) => <Input id={id} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />}</Field>
      <Field label="Tipo de respuesta">{(id) => <Select id={id} value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
      {q.kind === 'opciones' ? <Field label="Opciones (una por línea)">{(id) => <Textarea id={id} value={q.options} onChange={(e) => setQ({ ...q, options: e.target.value })} />}</Field> : null}
      <Button onClick={add} busy={busy} disabled={q.text.trim().length < 3}>Agregar pregunta</Button>
    </Card>
  );
}
