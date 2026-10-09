import { useState } from "react";
import { api } from "../lib/api.js";
import { appliedNote, coachText } from "../lib/coachText.js";
import { useAsync } from "../lib/useAsync.js";
import { sideLabel } from "../lib/format.js";
import { ErrorState } from "./PageState.jsx";
import Icon from "./Icon.jsx";

// Una sugerencia del asistente para el FISIOTERAPEUTA. Si trae una propuesta de ajuste del plan, solo se aplica cuando él
// pulsa «Aplicar»; al aplicarla queda una nota clínica con el motivo (trazabilidad). «Descartar» la oculta en esta pantalla.
function Suggestion({ item, pid, tid, evidence, onApplied }) {
  const [state, setState] = useState({ status: "idle", message: "" });
  const t = coachText(item, "therapist");
  const cited = item.evidence.map((c) => evidence.find((e) => e.code === c)).filter(Boolean);
  const { proposal } = item;

  async function apply() {
    setState({ status: "working", message: "" });
    try {
      await api.updatePlan(proposal.plan_id, { [proposal.field]: proposal.value });
      await api.addNote(pid, Number(tid), appliedNote(item, t.label));
      setState({ status: "applied", message: "Ajuste aplicado y registrado en las notas." });
      onApplied?.();
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  if (state.status === "dismissed") return null;
  return (
    <li className={`coach-item is-${t.tone}`}>
      <span className="coach-icon" aria-hidden="true"><Icon name={t.tone === "warn" ? "alert" : "target"} size={18} /></span>
      <div>
        <strong>{t.title}</strong>
        <p>{t.text}</p>
        {cited.length > 0 && (
          <ul className="coach-evidence">
            {cited.map((e) => (
              <li key={e.code}><a href={e.url} target="_blank" rel="noopener noreferrer">{e.authors.split(",")[0]} et al. ({e.year}) <Icon name="external" size={13} /></a><span> · Lo que no demuestra: {e.limitation}</span></li>
            ))}
          </ul>
        )}
        {proposal && state.status !== "applied" && (
          <div className="coach-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={state.status === "working"}>{state.status === "working" ? "Aplicando…" : `Aplicar: ${t.label}`}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState({ status: "dismissed", message: "" })} disabled={state.status === "working"}>Descartar</button>
          </div>
        )}
        {!proposal && state.status !== "applied" && (
          <div className="coach-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setState({ status: "dismissed", message: "" })}>Entendido</button></div>
        )}
        {state.status === "applied" && <p className="form-ok" role="status">{state.message}</p>}
        {state.status === "error" && <p className="notice notice-error" role="alert">No se pudo aplicar: {state.message}</p>}
      </div>
    </li>
  );
}

// Panel «Sugerencias del asistente» en la ficha del paciente. Nada se aplica solo.
export default function CoachSuggestions({ pid, tid, onApplied }) {
  const { data, error, loading, reload } = useAsync(() => api.coach(pid), [pid]);
  if (loading && !data) return <div className="skeleton" style={{ height: 110 }} aria-busy="true" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const plans = data.plans.filter((p) => p.therapist.length > 0);
  if (plans.length === 0) return null;
  return (
    <section className="card panel coach coach-therapist" aria-labelledby="h-coach-t">
      <div className="panel-head">
        <h2 id="h-coach-t"><Icon name="star" size={18} /> Sugerencias del asistente</h2>
        <p>Salen del análisis de las sesiones y del historial del paciente. <strong>Ninguna se aplica sola:</strong> la decisión clínica es suya.</p>
      </div>
      {plans.map((p) => (
        <div key={p.plan_id} className="coach-group">
          <h3>{p.exercise_name} · {sideLabel(p.side)}</h3>
          <ul>
            {p.therapist.map((item) => (
              <Suggestion key={item.code} item={item} pid={pid} tid={tid} evidence={data.evidence} onApplied={onApplied} />
            ))}
          </ul>
        </div>
      ))}
      <p className="coach-note">Los umbrales del asistente son orientativos, no criterio clínico, y la cámara tiene un margen de error de unos 3 a 5°.</p>
    </section>
  );
}
