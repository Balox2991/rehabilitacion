import { Link } from "react-router-dom";
import { pctText, relativeDays } from "../lib/format.js";
import { PHASES } from "../lib/labels.js";
import Avatar from "./Avatar.jsx";
import StatusPill from "./StatusPill.jsx";

function Dots({ done, total }) {
  return (
    <span className="mini-dots" aria-hidden="true">
      {Array.from({ length: Math.min(total, 7) }, (_, i) => <i key={i} className={i < done ? "is-on" : ""} />)}
    </span>
  );
}

// Una fila de paciente. TODO lo importante está visible a la vez (sin pasar el mouse ni abrir nada):
// quién es, cómo va, qué tan reciente fue su última sesión y qué se puede hacer con un clic.
export default function PatientRow({ p, tid }) {
  const detail = `/fisio/${tid}/paciente/${p.id}`;
  const phase = p.recovery_phase ? PHASES[p.recovery_phase].label : null;
  const meta = [p.fracture_site, p.diagnosis_code, p.days_since_injury != null && `día ${p.days_since_injury}`].filter(Boolean).join(" · ");
  return (
    <li className="prow">
      <div className="prow-id">
        <Avatar patient={p} size="md" />
        <div className="prow-id-text">
          <Link to={detail} className="prow-name">{p.name}</Link>
          <span className="prow-meta">{meta || "Sin lesión registrada"}</span>
          {phase && <span className="prow-phase">Etapa: {phase}</span>}
        </div>
      </div>

      <div className="prow-status"><StatusPill status={p.status} /></div>

      <dl className="prow-metrics">
        <div>
          <dt>Esta semana</dt>
          <dd>{p.planned_per_week ? <><strong className="num">{p.done_7d} de {p.planned_per_week}</strong> <Dots done={p.done_7d} total={p.planned_per_week} /></> : "—"}</dd>
        </div>
        <div>
          <dt>Progreso</dt>
          <dd><strong className="num">{pctText(p.progress_pct)}</strong>{p.progress_pct != null && <span className="prow-bar" aria-hidden="true"><i style={{ width: `${p.progress_pct}%` }} /></span>}</dd>
        </div>
        <div>
          <dt>Última sesión</dt>
          <dd><strong>{relativeDays(p.days_since_last_session)}</strong></dd>
        </div>
      </dl>

      <div className="prow-actions">
        <Link to={detail} className="btn btn-primary btn-sm" aria-label={`Ver paciente ${p.name}`}>Ver paciente</Link>
        <Link to={`${detail}/informe`} className="btn btn-ghost btn-sm" aria-label={`Generar informe de ${p.name}`}>Informe</Link>
      </div>
    </li>
  );
}
