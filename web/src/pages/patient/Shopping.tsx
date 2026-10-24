import { useEffect, useState } from 'react';
import { useApi } from '../../lib/hooks';
import { formatAmount } from '@shared/nutrition';
import { Card, ErrorBox, Loading, Tabs } from '../../components/ui';

export function Shopping() {
  const [week, setWeek] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/api/me/plan/shopping?week=${week}`);
  const storeKey = `nutriar:compras:${week}`;
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    // Preferencia local del dispositivo (no es información clínica): qué ya compraste.
    try {
      setChecked(JSON.parse(localStorage.getItem(storeKey) ?? '[]'));
    } catch {
      setChecked([]);
    }
  }, [storeKey]);
  const toggle = (k: string) => {
    const next = checked.includes(k) ? checked.filter((x) => x !== k) : [...checked, k];
    setChecked(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      /* sin almacenamiento local */
    }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <h1>Lista de compras</h1>
      {data.weeks > 1 ? <Tabs tabs={Array.from({ length: data.weeks }, (_, i) => ({ key: String(i + 1), label: `Semana ${i + 1}` }))} value={String(week)} onChange={(k) => setWeek(Number(k))} /> : null}
      <p className="small muted">Suma las cantidades de las opciones principales de tu plan para la semana. No incluye las alternativas.</p>
      <Card>
        {data.lines.length ? (
          <ul className="list">
            {data.lines.map((l: any) => {
              const k = `${l.food_id}-${l.unit}`;
              return (
                <li key={k}>
                  <label className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked.includes(k)} onChange={() => toggle(k)} style={{ width: 22, height: 22, accentColor: 'var(--primary)', flex: 'none', marginTop: 2 }} />
                    <span style={{ flex: 1, textDecoration: checked.includes(k) ? 'line-through' : undefined }}>
                      {l.name}
                      {l.from_recipes.length ? <span className="small muted"> · para {l.from_recipes.join(', ')}</span> : null}
                      {l.purchase_amount ? <div className="small muted">Comprá aprox. {formatAmount(l.purchase_amount, l.unit)} (con cáscara o hueso)</div> : null}
                    </span>
                    <strong className="nowrap">{formatAmount(l.amount, l.unit)}</strong>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No hay alimentos para esta semana.</p>
        )}
        {data.issues.map((i: any) => <p key={i.name} className="small" style={{ color: 'var(--danger)' }}>No incluido: {i.name} — {i.reason}</p>)}
      </Card>
    </>
  );
}
