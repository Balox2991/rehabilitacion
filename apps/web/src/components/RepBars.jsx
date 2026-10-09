import { repBarsModel } from "../lib/insights.js";

// Una barra por repetición: la altura es la flexión alcanzada y la línea punteada es la meta. Se ve de un vistazo si el
// recorrido se mantuvo, cayó (cansancio) o nunca llegó a la meta. Es SVG con viewBox: se adapta al ancho disponible.
const BAR = 22;
const GAP = 8;
const PAD = { left: 36, right: 10, top: 14, bottom: 24 };
const HEIGHT = 190;

export default function RepBars({ analysis, targetFlexion = null }) {
  const m = repBarsModel(analysis, targetFlexion);
  if (m.bars.length === 0) return null;
  const width = PAD.left + m.bars.length * (BAR + GAP) + PAD.right;
  const y = (v) => PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - v / m.max);
  const best = Math.max(...m.bars.map((b) => b.flexion));
  const label = `${m.bars.length} repeticiones; la mejor llegó a ${Math.round(best)} grados${targetFlexion != null ? ` y la meta es ${Math.round(targetFlexion)} grados` : ""}.`;

  return (
    <figure className="rep-bars">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} style={{ maxWidth: Math.max(width * 1.7, 360) }} role="img" aria-label={label}>
        {[0, m.max / 2, m.max].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="rb-grid" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="rb-tick">{Math.round(v)}°</text>
          </g>
        ))}
        {m.bars.map((b, i) => {
          const x = PAD.left + GAP / 2 + i * (BAR + GAP);
          return (
            <g key={b.n}>
              <rect x={x} y={y(b.flexion)} width={BAR} height={Math.max(1, y(0) - y(b.flexion))} rx="4" className={`rb-bar ${b.reached ? "" : "is-miss"}`}>
                <title>{`Repetición ${b.n}: ${Math.round(b.flexion)}°${b.flagged ? " · con alerta de postura" : ""}`}</title>
              </rect>
              {b.flagged && <circle cx={x + BAR / 2} cy={y(b.flexion) - 7} r="3.5" className="rb-flag" />}
              <text x={x + BAR / 2} y={HEIGHT - 8} textAnchor="middle" className="rb-tick">{b.n}</text>
            </g>
          );
        })}
        {m.target != null && (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(m.target)} y2={y(m.target)} className="rb-target" />
            <text x={width - PAD.right} y={y(m.target) - 4} textAnchor="end" className="rb-target-label">Meta {Math.round(m.target)}°</text>
          </g>
        )}
      </svg>
      <figcaption className="rb-legend">
        <span><i className="rb-key" /> Llegó a la meta</span>
        <span><i className="rb-key is-miss" /> Todavía no llega</span>
        <span><i className="rb-key is-flag" /> Alerta de postura</span>
      </figcaption>
    </figure>
  );
}
