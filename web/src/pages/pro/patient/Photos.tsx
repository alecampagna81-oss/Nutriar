import { useState } from 'react';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { formatDate, todayIn } from '../../../lib/format';
import { Alert, Button, Card, Empty, ErrorBox, Field, Input, Loading, PrivateImage, Select, Toggle, useAction } from '../../../components/ui';

export function UploadButton({ label, accept, onFile, busy }: { label: string; accept: string; onFile: (f: File) => void; busy?: boolean }) {
  return (
    <label className={`btn btn-secondary ${busy ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      {label}
      <input type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
  );
}

export function Photos({ patientId }: { patientId: string }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/patients/${patientId}/files?kind=foto_corporal`);
  const [takenOn, setTakenOn] = useState(todayIn());
  const [share, setShare] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const { busy, run } = useAction();
  async function upload(f: File) {
    const fd = new FormData();
    fd.append('kind', 'foto_corporal');
    fd.append('taken_on', takenOn);
    fd.append('shared', String(share));
    fd.append('file', f);
    if (await run(() => api.post(`/api/pro/patients/${patientId}/files`, fd), 'Foto guardada (se eliminaron los metadatos)')) reload();
  }
  async function toggle(f: any) {
    if (await run(() => api.patch(`/api/pro/patients/${patientId}/files/${f.id}`, { shared_with_patient: !f.shared_with_patient }))) reload();
  }
  if (loading && !data) return <Loading />;
  const photos = data ?? [];
  const pa = photos.find((p) => p.id === a);
  const pb = photos.find((p) => p.id === b);
  const label = (p: any) => `${p.taken_on ? formatDate(p.taken_on) : formatDate(p.created_at)}${p.title ? ` · ${p.title}` : ''}`;
  return (
    <>
      <Card title="Fotos corporales">
        <ErrorBox error={error} onRetry={reload} />
        <Alert tone="info">Opcionales y privadas. Se guardan sin metadatos (ubicación, cámara). El paciente puede subirlas si lo habilitás en “Acceso y configuración”.</Alert>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Fecha de la foto">{(id) => <Input id={id} type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />}</Field>
          <div className="field"><Toggle label="Compartir con el paciente" checked={share} onChange={setShare} /></div>
          <div className="field"><UploadButton label="Subir foto" accept="image/jpeg,image/png,image/webp" onFile={upload} busy={busy} /></div>
        </div>
        {photos.length ? (
          <div className="photo-grid">
            {photos.map((p) => (
              <figure key={p.id}>
                <PrivateImage src={p.url} alt={`Foto del ${label(p)}`} />
                <figcaption>
                  {label(p)}
                  <br />
                  {p.uploaded_by_role === 'patient' ? 'Subida por el paciente' : p.shared_with_patient ? 'Compartida' : 'Solo profesional'}
                  {p.uploaded_by_role !== 'patient' ? <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>{p.shared_with_patient ? 'Dejar de compartir' : 'Compartir'}</button> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <Empty title="Sin fotos" />
        )}
      </Card>
      {photos.length > 1 ? (
        <Card title="Comparar por fecha">
          <div className="grid-2">
            <Select aria-label="Primera foto" value={a} onChange={(e) => setA(e.target.value)}><option value="">Elegí una foto</option>{photos.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</Select>
            <Select aria-label="Segunda foto" value={b} onChange={(e) => setB(e.target.value)}><option value="">Elegí otra foto</option>{photos.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</Select>
          </div>
          {pa && pb ? (
            <div className="compare" style={{ marginTop: '0.8rem' }}>
              <figure style={{ margin: 0 }}><PrivateImage src={pa.url} alt={label(pa)} /><figcaption className="small muted">{label(pa)}</figcaption></figure>
              <figure style={{ margin: 0 }}><PrivateImage src={pb.url} alt={label(pb)} /><figcaption className="small muted">{label(pb)}</figcaption></figure>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
