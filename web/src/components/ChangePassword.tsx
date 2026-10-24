import { useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Field, Input, useAction } from './ui';

export function ChangePassword() {
  const [f, setF] = useState({ current: '', password: '', password2: '' });
  const [err, setErr] = useState('');
  const { busy, run } = useAction();
  async function save() {
    if (f.password !== f.password2) return setErr('Las contraseñas no coinciden');
    setErr('');
    if (await run(() => api.post('/api/auth/change-password', { current: f.current, password: f.password }), 'Contraseña actualizada')) setF({ current: '', password: '', password2: '' });
  }
  return (
    <Card title="Cambiar contraseña">
      <Field label="Contraseña actual">{(id) => <Input id={id} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />}</Field>
      <Field label="Nueva contraseña" hint="Mínimo 10 caracteres">{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
      <Field label="Repetí la nueva contraseña" error={err}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} />}</Field>
      <Button onClick={save} busy={busy} disabled={!f.current || !f.password}>Cambiar contraseña</Button>
    </Card>
  );
}
