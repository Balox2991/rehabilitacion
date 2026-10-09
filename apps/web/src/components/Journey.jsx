import { deg, sideLabel } from "../lib/format.js";
import { journey } from "../lib/patientHome.js";

// El recorrido de un ejercicio en lenguaje llano: dónde empezó, dónde está hoy y cuánto falta para la meta.
// Un número suelto («87 %») dice poco; «37° → 79° · meta 90°» se entiende sin explicación.
export default function Journey({ plan, compact = false }) {
  const j = journey(plan);
  const pct = j.pct == null ? 0 : Math.max(0, Math.min(100, j.pct));
  return (
    <div className={`journey ${compact ? "journey-compact" : ""}`}>
      <div className="journey-head">
        <strong>{plan.exercise_name}</strong>
        <span>{sideLabel(plan.side)}</span>
      </div>
      <div className="journey-track" role="img" aria-label={j.pct == null ? "Sin sesiones todavía" : `${j.pct} % del camino hacia la meta`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {compact ? (
        <p className="journey-line num">{j.now == null ? `Meta ${deg(j.target)}` : `${deg(j.start)} → ${deg(j.now)} · meta ${deg(j.target)}`}</p>
      ) : (
        <>
          <dl className="journey-facts">
            <div><dt>Primera sesión</dt><dd className="num">{deg(j.start)}</dd></div>
            <div><dt>Hoy</dt><dd className="num">{deg(j.now)}</dd></div>
            <div><dt>Meta</dt><dd className="num">{deg(j.target)}</dd></div>
          </dl>
          <p className="journey-note">
            {j.now == null ? "Haz tu primera sesión para empezar a ver tu recorrido." : j.remaining === 0 ? "Ya alcanzaste tu meta de este ejercicio." : `Te faltan ${j.remaining}° para tu meta.`}
          </p>
        </>
      )}
    </div>
  );
}
