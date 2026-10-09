import { achievements } from "../lib/patientHome.js";
import Icon from "./Icon.jsx";

// Logros del paciente: lo ganado en color, lo pendiente en gris con cuánto falta («7 de 10»).
// `compact` muestra solo las insignias (para el inicio); la versión completa añade el texto de cada una.
export default function Achievements({ data, compact = false }) {
  const list = achievements(data);
  const earned = list.filter((a) => a.earned).length;
  return (
    <section className={`card panel ach ${compact ? "ach-compact" : ""}`} aria-labelledby="h-ach">
      <div className="panel-head panel-head-row">
        <h2 id="h-ach">Tus logros</h2>
        <span className="week-count num">{earned} de {list.length}</span>
      </div>
      <ul className="ach-list">
        {list.map((a) => (
          <li key={a.id} className={`ach-item ${a.earned ? "is-earned" : ""}`}>
            <span className="ach-badge" aria-hidden="true"><Icon name={a.icon} size={compact ? 20 : 24} /></span>
            <div className="ach-text">
              <strong>{a.title}</strong>
              {!compact && <span>{a.text}</span>}
              <small className="num">{a.earned ? "Conseguido" : `${a.current} de ${a.target}`}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
