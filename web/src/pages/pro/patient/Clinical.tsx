import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { dt } from '../../../lib/format';
import { Alert, Button, Card, ErrorBox, Field, Loading, Textarea, useAction } from '../../../components/ui';
import { ALLERGENS } from '@shared/nutrition';
import { CLINICAL_FIELDS } from '@shared/questionnaire';

export function Clinical({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/api/pro/patients/${patientId}/clinical`);
  const [form, setForm] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const { busy, run } = useAction();
  useEffect(() => {
    if (data) setForm({ data: data.data ?? {}, allergens: data.allergens ?? [], restriction_notes: data.restriction_notes ?? '' });
  }, [data]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  if (loading && !form) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!form) return null;
  const set = (patch: any) => {
    setForm({ ...form, ...patch });
    setDirty(true);
  };
  async function save() {
    const r = await run(() => api.put(`/api/pro/patients/${patientId}/clinical`, form), 'Historia clínica guardada');
    if (r) {
      setDirty(false);
      onSaved();
      reload();
    }
  }
  return (
    <Card
      title="Historia clínica"
      actions={
        <>
          {dirty ? <span className="badge badge-warn">Cambios sin guardar</span> : null}
          <Button onClick={save} busy={busy} disabled={!dirty}>Guardar</Button>
        </>
      }
    >
      <Alert tone="info">Contenido interno de la profesional: el paciente no ve la historia clínica.{data?.updated_at ? ` Última modificación: ${dt(data.updated_at)}${data.updated_by_name ? ` por ${data.updated_by_name}` : ''}.` : ''}</Alert>
      <div className="field">
        <label>Alergias e intolerancias (se usan para advertir al armar planes)</label>
        <div className="checks">
          {Object.entries(ALLERGENS).map(([k, label]) => (
            <label key={k}>
              <input type="checkbox" checked={form.allergens.includes(k)} onChange={(e) => set({ allergens: e.target.checked ? [...form.allergens, k] : form.allergens.filter((a: string) => a !== k) })} />
              {label}
            </label>
          ))}
        </div>
        <div className="hint">Las advertencias dependen de las etiquetas de alérgenos de cada alimento, que son orientativas. Revisá siempre los ingredientes.</div>
      </div>
      <Field label="Restricciones a tener en cuenta en los planes" hint="Se muestran en el editor de planes.">{(id) => <Textarea id={id} value={form.restriction_notes} onChange={(e) => set({ restriction_notes: e.target.value })} />}</Field>
      <div className="grid-2">
        {CLINICAL_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>{(id) => <Textarea id={id} value={form.data[f.key] ?? ''} onChange={(e) => set({ data: { ...form.data, [f.key]: e.target.value } })} />}</Field>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={save} busy={busy} disabled={!dirty}>Guardar historia clínica</Button>
      </div>
    </Card>
  );
}
