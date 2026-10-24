import { Button, Input } from './ui';

export interface RecallRow {
  time: string;
  meal: string;
  description: string;
}

/** Registro alimentario de las últimas 24 horas. */
export function RecallEditor({ value, onChange, readOnly }: { value: RecallRow[]; onChange?: (v: RecallRow[]) => void; readOnly?: boolean }) {
  if (readOnly) {
    if (!value?.length) return <p className="muted small">Sin registro de 24 horas.</p>;
    return (
      <table className="table">
        <thead><tr><th>Hora</th><th>Comida</th><th>Qué comió/bebió y cantidad</th></tr></thead>
        <tbody>{value.map((r, i) => <tr key={i}><td>{r.time}</td><td>{r.meal}</td><td>{r.description}</td></tr>)}</tbody>
      </table>
    );
  }
  const rows = value ?? [];
  const set = (i: number, k: keyof RecallRow, v: string) => onChange!(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <Input aria-label="Hora" type="time" value={r.time} onChange={(e) => set(i, 'time', e.target.value)} style={{ width: 110, flex: 'none' }} />
          <div className="stack" style={{ flex: 1, gap: '0.3rem' }}>
            <Input aria-label="Comida" placeholder="Comida (ej.: desayuno)" value={r.meal} onChange={(e) => set(i, 'meal', e.target.value)} />
            <Input aria-label="Descripción" placeholder="Qué comiste o tomaste y cuánto" value={r.description} onChange={(e) => set(i, 'description', e.target.value)} />
          </div>
          <button type="button" className="icon-btn" aria-label="Quitar fila" onClick={() => onChange!(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <Button variant="secondary" className="btn-sm" onClick={() => onChange!([...rows, { time: '', meal: '', description: '' }])}>Agregar comida o bebida</Button>
    </div>
  );
}
