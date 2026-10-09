import { useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { alertReason, deg, formatDay, formatTime, pctText, relativeDays, sideLabel, statusHeadline, suggestedAction } from "../../lib/format.js";
import { areaLabel, phaseLabel } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import { EvolutionCard, PlanCards, StatsRow, WeekAndRecent } from "../../components/ProgressParts.jsx";
import Icon from "../../components/Icon.jsx";
import StatusPill from "../../components/StatusPill.jsx";
import CoachSuggestions from "../../components/CoachSuggestions.jsx";
import SessionAnalysis from "../../components/SessionAnalysis.jsx";

// Lo primero que el fisioterapeuta necesita saber al abrir la ficha: cómo va y qué hacer. Usa la MISMA fila de estado
// que el panel (summarizePatient en el servidor), así ambos siempre coinciden.
function StatusCard({ summary }) {
  const reason = alertReason(summary);
  const action = suggestedAction(summary.status);
  return (
    <section className="card panel status-card" aria-labelledby="h-estado">
      <div className="status-main">
        <span className="kpi-label" id="h-estado">Estado actual</span>
        <div className="status-headline"><StatusPill status={summary.status} /><strong>{statusHeadline(summary.status)}</strong></div>
        {reason && <p className="status-reason">{reason}</p>}
        {action && <p className="task-action"><Icon name="arrow" size={13} /> {action}</p>}
      </div>
      <dl className="status-facts">
        <div><dt>Sesiones esta semana</dt><dd>{summary.planned_per_week ? `${summary.done_7d} de ${summary.planned_per_week}` : "—"}</dd></div>
        <div><dt>Progreso</dt><dd>{pctText(summary.progress_pct)}</dd></div>
        <div><dt>Última sesión</dt><dd>{relativeDays(summary.days_since_last_session)}</dd></div>
        <div><dt>Alertas (30 días)</dt><dd>{summary.compensation_rate_30d == null ? "—" : `${summary.compensation_rate_30d} %`}</dd></div>
      </dl>
    </section>
  );
}

export function SummaryTab() {
  const { data, tid, pid, reload } = useOutletContext();
  const { assigned } = data.routines;
  return (
    <div className="tab-body">
      <StatusCard summary={data.summary} />
      <CoachSuggestions pid={pid} tid={tid} onApplied={reload} />
      <StatsRow data={data} />
      <div className="pp-grid">
        <div className="pp-main">
          <section aria-labelledby="h-plan">
            <h2 className="section-h" id="h-plan">Plan activo</h2>
            <PlanCards data={data} />
          </section>
          <EvolutionCard plans={data.plans} />
        </div>
        <aside className="pp-side">
          <WeekAndRecent data={data} />
          <section className="card card-pad" aria-labelledby="h-rutinas">
            <h2 className="card-title" id="h-rutinas">Rutinas asignadas</h2>
            {assigned.length === 0 ? (
              <p className="card-sub" style={{ marginTop: 8 }}>Ninguna todavía. Puedes asignarlas en «Plan y rutinas».</p>
            ) : (
              <ul className="assigned-list compact">
                {assigned.map((r) => (
                  <li key={r.assignment_id}>
                    <div><strong>{r.title}</strong><small>{areaLabel(r.body_area)} · {phaseLabel(r.phase)}</small></div>
                  </li>
                ))}
              </ul>
            )}
            <Link to={`/fisio/${tid}/biblioteca`} className="link-arrow" style={{ marginTop: 10 }}>Ver la biblioteca</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function SessionsTab() {
  const { pid } = useOutletContext();
  const { data, error, loading, reload } = useAsync(() => api.sessions(pid), [pid]);
  const [open, setOpen] = useState(null);
  const [details, setDetails] = useState({});
  const panel = useRef(null);

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function toggle(id) {
    if (open === id) return setOpen(null);
    setOpen(id);
    // El análisis se abre en una tarjeta APARTE, debajo de la tabla: dentro de una celda quedaba ancho y obligaba a desplazarse de lado.
    requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }));
    if (!details[id]) {
      try {
        const s = await api.session(id);
        setDetails((d) => ({ ...d, [id]: s }));
      } catch (err) {
        setDetails((d) => ({ ...d, [id]: { error: err.message } }));
      }
    }
  }

  const selected = data.find((s) => s.id === open);
  const detail = open == null ? null : details[open];

  return (
    <div className="tab-body">
      <section className="card">
        <div className="card-pad">
          <h2 className="card-title">Historial de sesiones</h2>
          <p className="card-sub">{data.length} sesiones registradas. Abre una para ver su análisis: repeticiones, ritmo, observaciones y el movimiento.</p>
        </div>
        {data.length === 0 ? (
          <p className="card-pad card-sub">Este paciente todavía no tiene sesiones.</p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Ejercicio</th><th>Repeticiones</th><th>Mejor flexión</th><th>Con alerta</th><th><span className="sr-only">Detalle</span></th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className={open === s.id ? "is-selected" : ""}>
                    <td>{formatDay(s.started_at)} <small className="cell-sub">{formatTime(s.started_at)}</small></td>
                    <td>{s.exercise_name}<small className="cell-sub">{sideLabel(s.side)}</small></td>
                    <td className="num">{s.reps_completed}</td>
                    <td className="num"><strong>{deg(s.flexion)}</strong></td>
                    <td>{s.compensation_count > 0 ? <span className="pill pill-warn">{s.compensation_count}</span> : <span className="cell-mute">—</span>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(s.id)} aria-expanded={open === s.id} aria-controls="analisis-sesion">{open === s.id ? "Ocultar" : "Ver análisis"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="card panel" id="analisis-sesion" ref={panel} aria-labelledby="h-analisis">
          <div className="panel-head panel-head-row">
            <div>
              <h2 id="h-analisis">Análisis de la sesión</h2>
              <p>{selected.exercise_name} · {sideLabel(selected.side)} · {formatDay(selected.started_at)}, {formatTime(selected.started_at)}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>Cerrar</button>
          </div>
          {!detail ? <span className="cell-mute">Cargando…</span> : detail.error ? <span className="notice notice-error">{detail.error}</span> : (
            <SessionAnalysis session={detail} onChange={(fresh) => setDetails((d) => ({ ...d, [open]: fresh }))} />
          )}
        </section>
      )}
    </div>
  );
}

export function NotesTab() {
  const { pid, tid } = useOutletContext();
  const { data, error, loading, reload } = useAsync(() => api.notes(pid), [pid]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setProblem("");
    try {
      await api.addNote(pid, Number(tid), text);
      setText("");
      reload();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tab-body">
      <form className="card card-pad form-card" onSubmit={add}>
        <h2 className="card-title">Nueva nota clínica</h2>
        <label className="note-field">
          <span className="sr-only">Texto de la nota</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} placeholder="Evolución, molestias que refiere, decisiones sobre el plan…" required />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || !text.trim()}>{saving ? "Guardando…" : "Guardar nota"}</button>
          <span className="card-sub num">{text.length}/2000</span>
        </div>
        {problem && <p className="notice notice-error" role="alert">{problem}</p>}
      </form>

      <section aria-labelledby="h-notas">
        <h2 className="section-h" id="h-notas">Historial de notas</h2>
        {data.length === 0 ? <p className="card-sub">Sin notas todavía.</p> : (
          <ol className="timeline">
            {data.map((n) => (
              <li key={n.id} className="card card-pad">
                <div className="timeline-head"><strong>{n.author_name ?? "Fisioterapeuta"}</strong><span className="cell-mute">{formatDay(n.created_at)} · {formatTime(n.created_at)}</span></div>
                <p>{n.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
