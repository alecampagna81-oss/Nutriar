import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { formatDate, todayIn } from '../../../lib/format';
import { Alert, Badge, Button, Card, Confirm, Empty, ErrorBox, Field, Input, Loading, Modal, Select, Textarea, Toggle, useAction } from '../../../components/ui';
import { LineChart } from '../../../components/LineChart';
import { DERIVED, derivedSeries, MEASURE_KINDS } from '@shared/measures';
import { settingsOf } from './settings';

export function Measurements({ patient, onSettingsChanged }: { patient: any; onSettingsChanged: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/api/pro/patients/${patient.id}/measurements`);
  const [form, setForm] = useState({ measured_on: todayIn(), kind: 'peso', value: '', method: '', note: '' });
  const [toDelete, setToDelete] = useState<any>(null);
  const { busy, run } = useAction();
  const [shared, setShared] = useState<string[]>(patient.shared_indicators);
  useEffect(() => setShared(patient.shared_indicators), [patient.shared_indicators]);
  async function add() {
    if (await run(() => api.post(`/api/pro/patients/${patient.id}/measurements`, { ...form, value: Number(String(form.value).replace(',', '.')) }), 'Medición registrada')) {
      setForm({ ...form, value: '', note: '' });
      reload();
    }
  }
  async function remove() {
    if (await run(() => api.del(`/api/pro/patients/${patient.id}/measurements/${toDelete.id}`), 'Medición anulada')) {
      setToDelete(null);
      reload();
    }
  }
  async function toggleShare(key: string, on: boolean) {
    const prev = shared;
    const next = on ? [...shared, key] : shared.filter((k: string) => k !== key);
    setShared(next); // se muestra el cambio y se revierte si el servidor no lo confirma
    if (await run(() => api.patch(`/api/pro/patients/${patient.id}`, { settings: { ...settingsOf(patient), shared_indicators: next } }), on ? 'Indicador compartido con el paciente' : 'Indicador oculto para el paciente')) onSettingsChanged();
    else setShared(prev);
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const rows: any[] = data.rows;
  const kinds = MEASURE_KINDS.filter((k) => rows.some((r) => r.kind === k.key));
  const unit = MEASURE_KINDS.find((k) => k.key === form.kind)?.unit;
  return (
    <>
      <div className="grid-2">
        <Card title="Registrar medición">
          <div className="grid-2">
            <Field label="Fecha">{(id) => <Input id={id} type="date" value={form.measured_on} onChange={(e) => setForm({ ...form, measured_on: e.target.value })} />}</Field>
            <Field label="Indicador">{(id) => (
              <Select id={id} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {MEASURE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </Select>
            )}</Field>
            <Field label={`Valor (${unit})`}>{(id) => <Input id={id} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}</Field>
            <Field label="Método o equipo" hint="Ej.: balanza del consultorio, bioimpedancia">{(id) => <Input id={id} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />}</Field>
          </div>
          <Field label="Nota">{(id) => <Input id={id} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}</Field>
          <Button onClick={add} busy={busy} disabled={!form.value}>Guardar medición</Button>
        </Card>
        <Card title="Qué ve el paciente">
          <p className="small muted">Elegí qué indicadores y gráficos compartir. El paciente siempre ve las mediciones que él mismo cargó.</p>
          {[...MEASURE_KINDS, ...DERIVED].map((k) => (
            <Toggle key={k.key} label={k.label} checked={shared.includes(k.key)} onChange={(v) => toggleShare(k.key, v)} />
          ))}
        </Card>
      </div>
      <Card title="Evolución">
        {kinds.length ? (
          <div className="grid-2">
            {kinds.map((k) => (
              <div key={k.key}>
                <h3>{k.label} <span className="muted small">({k.unit})</span> {shared.includes(k.key) ? <Badge tone="ok">Compartido</Badge> : null}</h3>
                <LineChart label={k.label} unit={k.unit} points={rows.filter((r) => r.kind === k.key).map((r) => ({ date: r.measured_on, value: r.value, source: r.source }))} />
              </div>
            ))}
            {DERIVED.map((d) => {
              const s = derivedSeries(rows, d.key as 'imc' | 'cintura_talla');
              const missing = d.needs.filter((n) => !rows.some((r) => r.kind === n));
              return (
                <div key={d.key}>
                  <h3>{d.label}</h3>
                  {s.length ? (
                    <LineChart label={d.label} unit={d.unit} points={s.map((x) => ({ date: x.measured_on, value: x.value, source: 'calculado' }))} />
                  ) : (
                    <p className="muted small">No se calcula: faltan mediciones de {missing.length ? missing.join(' y ') : 'talla previa a la fecha'}.</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="Todavía no hay mediciones" />
        )}
      </Card>
      <Card title="Historial">
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Indicador</th><th className="num">Valor</th><th>Origen</th><th>Método / nota</th><th /></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.measured_on)}</td>
                    <td>{MEASURE_KINDS.find((k) => k.key === r.kind)?.label ?? r.kind}</td>
                    <td className="num">{r.value.toLocaleString('es-AR')} {r.unit}</td>
                    <td>{r.source === 'paciente' ? <Badge tone="accent">Informada por el paciente</Badge> : <Badge tone="info">Profesional</Badge>}<div className="small muted">{r.author}</div></td>
                    <td className="small">{[r.method, r.note].filter(Boolean).join(' · ') || '—'}</td>
                    <td><Button variant="ghost" className="btn-sm" onClick={() => setToDelete(r)}>Anular</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin mediciones" />
        )}
      </Card>
      <Goals patientId={patient.id} />
      {toDelete ? (
        <Confirm title="Anular medición" danger confirmLabel="Anular" busy={busy} onClose={() => setToDelete(null)} onConfirm={remove}>
          <p>Se anulará la medición del {formatDate(toDelete.measured_on)} ({toDelete.value} {toDelete.unit}). Deja de mostrarse en gráficos e historial, pero queda registrada en la auditoría.</p>
        </Confirm>
      ) : null}
    </>
  );
}

const GOAL_CAT: Record<string, string> = { habito: 'Hábito', medicion: 'Medición', alimentacion: 'Alimentación', otro: 'Otro' };

function Goals({ patientId }: { patientId: string }) {
  const { data, reload } = useApi<any[]>(`/api/pro/patients/${patientId}/goals`);
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  async function save() {
    const url = `/api/pro/patients/${patientId}/goals${edit.id ? `/${edit.id}` : ''}`;
    const body = { description: edit.description, category: edit.category, target: edit.target, status: edit.status, shared: edit.shared };
    if (await run(() => (edit.id ? api.put(url, body) : api.post(url, body)), 'Objetivo guardado')) {
      setEdit(null);
      reload();
    }
  }
  return (
    <Card title="Objetivos" actions={<Button variant="secondary" onClick={() => setEdit({ description: '', category: 'habito', target: '', status: 'activo', shared: true })}>Nuevo objetivo</Button>}>
      <Alert tone="info">Podés definir objetivos de hábitos y alimentación, no solo de peso.</Alert>
      {data?.length ? (
        <ul className="list">
          {data.map((g) => (
            <li key={g.id} className="row-between">
              <span>
                <strong>{g.description}</strong> {g.target ? <span className="muted">— {g.target}</span> : null}
                <br />
                <span className="small muted">{GOAL_CAT[g.category]} · {g.shared ? 'visible para el paciente' : 'solo profesional'}</span>
              </span>
              <span className="row">
                <Badge tone={g.status === 'logrado' ? 'ok' : g.status === 'pausado' ? 'neutral' : 'info'}>{g.status}</Badge>
                <Button variant="ghost" className="btn-sm" onClick={() => setEdit({ ...g })}>Editar</Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Sin objetivos" />
      )}
      {edit ? (
        <Modal title={edit.id ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={() => setEdit(null)} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} busy={busy}>Guardar</Button></>}>
          <Field label="Descripción" required>{(id) => <Textarea id={id} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
          <div className="grid-2">
            <Field label="Tipo">{(id) => <Select id={id} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{Object.entries(GOAL_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Estado">{(id) => <Select id={id} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="activo">Activo</option><option value="logrado">Logrado</option><option value="pausado">Pausado</option></Select>}</Field>
          </div>
          <Field label="Meta o criterio" hint="Ej.: 5 días por semana">{(id) => <Input id={id} value={edit.target ?? ''} onChange={(e) => setEdit({ ...edit, target: e.target.value })} />}</Field>
          <Toggle label="Visible para el paciente" checked={edit.shared} onChange={(v) => setEdit({ ...edit, shared: v })} />
        </Modal>
      ) : null}
    </Card>
  );
}
