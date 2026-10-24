import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { dt } from '../../../lib/format';
import { Alert, Badge, Button, Card, Confirm, Field, Input, Modal, Select, Toggle, useAction } from '../../../components/ui';
import { settingsOf } from './settings';
import { INVITE } from '../Patients';

export function Access({ patient: p, reload }: { patient: any; reload: () => void }) {
  const nav = useNavigate();
  const { emailConfigured } = useAuth();
  const { busy, run } = useAction();
  const [link, setLink] = useState<{ url: string; kind: string } | null>(null);
  const [form, setForm] = useState({ first_name: p.first_name, last_name: p.last_name, email: p.email ?? '', phone: p.phone ?? '', birth_date: p.birth_date ?? '', sex: p.sex ?? '' });
  const [settings, setSettings] = useState(settingsOf(p));
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const [confirmName, setConfirmName] = useState('');
  useEffect(() => setSettings(settingsOf(p)), [p]);

  async function invite(sendEmail: boolean) {
    const r = await run(() => api.post(`/api/pro/patients/${p.id}/invitation`, { send_email: sendEmail }));
    if (!r) return;
    setLink({ url: r.link, kind: 'invitación' });
    reload();
  }
  async function resetLink() {
    const r = await run(() => api.post(`/api/pro/patients/${p.id}/reset-link`));
    if (r) setLink({ url: r.link, kind: 'restablecimiento de contraseña' });
  }
  async function saveData() {
    if (await run(() => api.patch(`/api/pro/patients/${p.id}`, form), 'Datos guardados')) reload();
  }
  async function saveSettings() {
    if (await run(() => api.patch(`/api/pro/patients/${p.id}`, { settings }), 'Configuración guardada')) reload();
  }
  async function archive() {
    if (await run(() => api.post(`/api/pro/patients/${p.id}/${p.archived_at ? 'unarchive' : 'archive'}`), p.archived_at ? 'Paciente reactivado' : 'Paciente archivado')) {
      setConfirm(null);
      reload();
    }
  }
  async function remove() {
    if (await run(() => api.del(`/api/pro/patients/${p.id}`, { confirm_name: confirmName }), 'Paciente eliminado definitivamente')) nav('/pro/pacientes');
  }
  const inv = p.invitation;
  return (
    <>
      <div className="grid-2">
        <Card title="Acceso del paciente">
          {p.user_id ? (
            <>
              <Alert tone="ok">El paciente activó su cuenta ({p.account?.email}) el {dt(p.account?.created_at)}.</Alert>
              <Button variant="secondary" onClick={resetLink} busy={busy}>Generar enlace para restablecer su contraseña</Button>
            </>
          ) : (
            <>
              {inv ? (
                <p>
                  Última invitación: <Badge tone={INVITE[inv.status].tone}>{INVITE[inv.status].label}</Badge>
                  <br />
                  <span className="small muted">Creada {dt(inv.created_at)} · vence {dt(inv.expires_at)}{inv.email_status === 'enviado' ? ` · enviada a ${inv.email}` : inv.email_status === 'error' ? ' · el envío por correo falló' : ''}</span>
                </p>
              ) : (
                <p className="muted">Todavía no invitaste a este paciente.</p>
              )}
              <p className="small muted">El enlace es personal, vence en 7 días y sirve una sola vez. Generar uno nuevo anula el anterior.</p>
              <div className="row">
                <Button onClick={() => invite(false)} busy={busy}>Generar enlace de invitación</Button>
                {emailConfigured && p.email ? <Button variant="secondary" onClick={() => invite(true)} busy={busy}>Enviar por correo</Button> : null}
                {inv?.status === 'pendiente' ? <Button variant="ghost" onClick={() => run(() => api.del(`/api/pro/patients/${p.id}/invitation`), 'Invitación anulada').then(reload)}>Anular invitación</Button> : null}
              </div>
              {!emailConfigured ? <p className="small muted" style={{ marginTop: '0.5rem' }}>El envío de correos no está configurado en este servidor: copiá el enlace y compartilo por un canal seguro.</p> : null}
            </>
          )}
        </Card>
        <Card title="Qué puede ver y hacer el paciente">
          <Toggle label="Ver calorías y macronutrientes" hint="Se aplica además a cada plan (opción del editor)." checked={settings.show_nutrients} onChange={(v) => setSettings({ ...settings, show_nutrients: v })} />
          <Toggle label="Cargar su peso y perímetros" checked={settings.allow_self_measurements} onChange={(v) => setSettings({ ...settings, allow_self_measurements: v })} />
          <Toggle label="Subir fotos corporales" checked={settings.allow_body_photos} onChange={(v) => setSettings({ ...settings, allow_body_photos: v })} />
          <h3 style={{ marginTop: '0.8rem' }}>Hábitos a registrar</h3>
          {settings.habits.map((h: any, i: number) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap', marginBottom: '0.4rem' }}>
              <Input aria-label="Nombre del hábito" value={h.name} onChange={(e) => setSettings({ ...settings, habits: settings.habits.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input aria-label="Unidad" value={h.unit} style={{ width: 100 }} onChange={(e) => setSettings({ ...settings, habits: settings.habits.map((x: any, j: number) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
              <Input aria-label="Meta diaria" type="number" min={0} value={h.target ?? ''} style={{ width: 90 }} placeholder="Meta" onChange={(e) => setSettings({ ...settings, habits: settings.habits.map((x: any, j: number) => (j === i ? { ...x, target: e.target.value ? Number(e.target.value) : null } : x)) })} />
              <button className="icon-btn" aria-label="Quitar hábito" onClick={() => setSettings({ ...settings, habits: settings.habits.filter((_: any, j: number) => j !== i) })}>×</button>
            </div>
          ))}
          <div className="row">
            <Button variant="secondary" className="btn-sm" onClick={() => setSettings({ ...settings, habits: [...settings.habits, { key: `h${Date.now().toString(36)}`, name: '', unit: 'veces', target: null }] })}>Agregar hábito</Button>
            <Button onClick={saveSettings} busy={busy}>Guardar configuración</Button>
          </div>
          <p className="small muted" style={{ marginTop: '0.6rem' }}>Los indicadores compartidos se eligen en la pestaña Mediciones.</p>
        </Card>
      </div>
      <Card title="Datos personales">
        <div className="grid-3">
          <Field label="Nombre">{(id) => <Input id={id} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />}</Field>
          <Field label="Apellido">{(id) => <Input id={id} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />}</Field>
          <Field label="Correo de contacto">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Teléfono">{(id) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label="Fecha de nacimiento">{(id) => <Input id={id} type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />}</Field>
          <Field label="Sexo">{(id) => <Select id={id} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}><option value="">Sin especificar</option><option value="femenino">Femenino</option><option value="masculino">Masculino</option><option value="otro">Otro</option></Select>}</Field>
        </div>
        <Button onClick={saveData} busy={busy}>Guardar datos</Button>
      </Card>
      <Card title="Exportar, archivar y eliminar">
        <div className="row">
          <Button variant="secondary" onClick={() => run(() => download(`/api/pro/patients/${p.id}/export`, `paciente-${p.last_name}.zip`), 'Exportación descargada')}>Exportar todos los datos (ZIP)</Button>
          <Button variant="secondary" onClick={() => setConfirm('archive')}>{p.archived_at ? 'Reactivar paciente' : 'Archivar paciente'}</Button>
          {p.archived_at ? <Button variant="danger" onClick={() => setConfirm('delete')}>Eliminar definitivamente</Button> : null}
        </div>
        <p className="small muted" style={{ marginTop: '0.6rem' }}>Archivar oculta al paciente del listado y desactiva su acceso, conservando toda la información. La eliminación definitiva solo está disponible para pacientes archivados y no se puede deshacer.</p>
      </Card>
      {link ? (
        <Modal title={`Enlace de ${link.kind}`} onClose={() => setLink(null)} footer={<Button onClick={() => setLink(null)}>Listo</Button>}>
          <Alert tone="warn">Este enlace se muestra una sola vez y da acceso a la cuenta. Compartilo solo con el paciente.</Alert>
          <Input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Enlace" />
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(link.url).then(() => run(async () => undefined, 'Enlace copiado'))}>Copiar enlace</Button>
          </div>
        </Modal>
      ) : null}
      {confirm === 'archive' ? (
        <Confirm title={p.archived_at ? 'Reactivar paciente' : 'Archivar paciente'} onClose={() => setConfirm(null)} onConfirm={archive} busy={busy}>
          <p>{p.archived_at ? 'El paciente volverá al listado. Si tenía cuenta, podrá volver a ingresar.' : 'El paciente dejará de poder ingresar y se anularán las invitaciones pendientes. Su información se conserva.'}</p>
        </Confirm>
      ) : null}
      {confirm === 'delete' ? (
        <Confirm title="Eliminar definitivamente" danger confirmLabel="Eliminar para siempre" onClose={() => setConfirm(null)} onConfirm={remove} busy={busy}>
          <Alert tone="danger">Se borrarán historia clínica, planes, registros, mensajes, fotos y documentos. Esta acción no se puede deshacer. Considerá exportar los datos antes.</Alert>
          <Field label={`Escribí “${p.first_name} ${p.last_name}” para confirmar`}>{(id) => <Input id={id} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />}</Field>
        </Confirm>
      ) : null}
    </>
  );
}
