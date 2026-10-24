import { useState } from 'react';
import { formatDate } from '../lib/format';

export interface Point {
  date: string; // AAAA-MM-DD
  value: number;
  source?: 'profesional' | 'paciente' | 'calculado';
}

/**
 * Serie temporal simple en SVG. Una sola serie por gráfico (un solo eje).
 * El origen de cada punto se codifica con la forma del marcador, no solo con color.
 */
export function LineChart({ points, unit, label }: { points: Point[]; unit: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <p className="muted small">Sin datos todavía.</p>;
  const W = 400, H = 190, L = 46, R = 10, T = 12, B = 28;
  const pts = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const xs = pts.map((p) => new Date(p.date + 'T12:00:00Z').getTime());
  const ys = pts.map((p) => p.value);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = (maxY - minY || Math.abs(maxY) * 0.05 || 1) * 0.2;
  minY -= pad;
  maxY += pad;
  const x = (t: number) => (maxX === minX ? L + (W - L - R) / 2 : L + ((t - minX) / (maxX - minX)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - minY) / (maxY - minY)) * (H - T - B);
  const ticks = [minY + pad, (minY + maxY) / 2, maxY - pad];
  const span = maxY - minY - 2 * pad;
  const dec = span === 0 ? (Math.abs(maxY) < 10 ? 2 : 1) : span < 0.5 ? 2 : span < 5 ? 1 : 0;
  const fmt = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const hasPatient = pts.some((p) => p.source === 'paciente');
  const hp = hover !== null ? pts[hover] : null;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${label}: ${pts.length} registros. Último: ${pts.at(-1)!.value} ${unit}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#ebe5da" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#5d675f">{fmt(t)}</text>
          </g>
        ))}
        <text x={L} y={H - 8} fontSize="12" fill="#5d675f">{formatDate(pts[0].date)}</text>
        {pts.length > 1 ? <text x={W - R} y={H - 8} fontSize="12" fill="#5d675f" textAnchor="end">{formatDate(pts.at(-1)!.date)}</text> : null}
        <path d={d} fill="none" stroke="#2f6b4f" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => {
          const cx = x(xs[i]), cy = y(p.value);
          const active = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              {p.source === 'paciente' ? (
                <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="#fff" stroke="#b5562e" strokeWidth={2} transform={`rotate(45 ${cx} ${cy})`} />
              ) : (
                <circle cx={cx} cy={cy} r={active ? 6 : 4.5} fill="#2f6b4f" stroke="#fff" strokeWidth={2} />
              )}
            </g>
          );
        })}
        {hp ? (
          <g pointerEvents="none">
            <rect x={Math.min(x(xs[hover!]) - 70, W - 150)} y={4} width={140} height={34} rx={6} fill="#1f2a24" opacity={0.92} />
            <text x={Math.min(x(xs[hover!]) - 62, W - 142)} y={19} fontSize="12" fill="#fff">{formatDate(hp.date)}</text>
            <text x={Math.min(x(xs[hover!]) - 62, W - 142)} y={32} fontSize="12" fill="#fff" fontWeight="700">
              {hp.value.toLocaleString('es-AR')} {unit} {hp.source === 'paciente' ? '(paciente)' : hp.source === 'calculado' ? '(calculado)' : ''}
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="chart-legend">
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="#2f6b4f" /></svg> {pts.some((p) => p.source === 'calculado') ? 'Calculado a partir de mediciones' : 'Tomada por la profesional'}</span>
        {hasPatient ? <span><svg width="12" height="12"><rect x="2" y="2" width="8" height="8" fill="#fff" stroke="#b5562e" strokeWidth="2" transform="rotate(45 6 6)" /></svg> Informada por el paciente</span> : null}
      </figcaption>
    </figure>
  );
}
