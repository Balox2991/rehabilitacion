import { Link } from "react-router-dom";
import { coachAction, coachText } from "../lib/coachText.js";
import Icon from "./Icon.jsx";

const GROUPS = [
  ["highlights", "Lo que va bien"],
  ["focus", "Para tu próxima sesión"],
  ["care", "Habla con tu fisioterapeuta"],
];
const ICON = { good: "star", info: "target", warn: "alert" };
const shortAuthors = (a) => (a.length > 60 ? `${a.split(",").slice(0, 2).join(",")} et al.` : a);

// Estudio que respalda una recomendación: quién, cuándo, y lo que NO demuestra (honestidad antes que autoridad).
function Evidence({ items }) {
  if (!items.length) return null;
  return (
    <ul className="coach-evidence">
      {items.map((e) => (
        <li key={e.code}>
          <a href={e.url} target="_blank" rel="noopener noreferrer">{shortAuthors(e.authors)} ({e.year}) <Icon name="external" size={13} /></a>
          <span> · Lo que no demuestra: {e.limitation}</span>
        </li>
      ))}
    </ul>
  );
}

// Recomendaciones del asistente para el PACIENTE, de UN plan: salen del análisis del video de su sesión, de su historial y
// de su plan. Cada una explica por qué («¿Por qué te lo digo?») con sus propios números y, si aplica, cita el estudio.
export default function CoachCard({ plan, evidence = [], pid, libraryCode = null, title = "Tu asistente de recuperación" }) {
  const groups = GROUPS.map(([key, label]) => [key, label, plan.patient[key]]).filter(([, , list]) => list.length > 0);
  if (groups.length === 0) return null;
  const byCode = Object.fromEntries(evidence.map((e) => [e.code, e]));
  return (
    <section className="card panel coach" aria-labelledby={`h-coach-${plan.plan_id}`}>
      <div className="panel-head">
        <h2 id={`h-coach-${plan.plan_id}`}><Icon name="star" size={18} /> {title}</h2>
        <p>{plan.exercise_name} · hecho con tus datos y el análisis de tu video.</p>
      </div>
      <div className="coach-groups">
        {groups.map(([key, label, list]) => (
          <div key={key} className="coach-group">
            <h3>{label}</h3>
            <ul>
              {list.map((item) => {
                const t = coachText(item, "patient", key);
                const action = coachAction(item, { pid, libraryCode });
                const cited = item.evidence.map((c) => byCode[c]).filter(Boolean);
                return (
                  <li key={item.code} className={`coach-item is-${t.tone}`}>
                    <span className="coach-icon" aria-hidden="true"><Icon name={ICON[t.tone]} size={18} /></span>
                    <div>
                      <strong>{t.title}</strong>
                      <p>{t.text}</p>
                      {action && <Link to={action.to} className="link-arrow">{action.label} <Icon name="arrow" size={15} /></Link>}
                      <details className="coach-why">
                        <summary>¿Por qué te lo digo?</summary>
                        <p>{t.why}</p>
                        <Evidence items={cited} />
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="coach-note">Orientación general con tus datos. No reemplaza a tu fisioterapeuta: si algo te duele o te preocupa, avísale.</p>
    </section>
  );
}
