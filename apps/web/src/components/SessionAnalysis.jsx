import { useState } from "react";
import { api } from "../lib/api.js";
import { deg } from "../lib/format.js";
import Icon from "./Icon.jsx";
import InsightList from "./InsightList.jsx";
import Kpi from "./Kpi.jsx";
import RepBars from "./RepBars.jsx";
import SkeletonReplay from "./SkeletonReplay.jsx";

const sec = (v) => (v == null ? "—" : `${String(v).replace(".", ",")} s`);

// Detalle de UNA sesión para el fisioterapeuta: cifras, una barra por repetición, observaciones del análisis, tabla con el
// tempo de cada repetición y el replay del movimiento. `session` = GET /sessions/:id. Sin análisis (sesiones antiguas o
// sin registro) muestra solo las repeticiones, como antes.
export default function SessionAnalysis({ session, onChange }) {
  const [showReplay, setShowReplay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const a = session.analysis;
  const targetFlexion = session.direction === "decreasing" ? 180 - session.target_angle : session.target_angle;

  if (!a) {
    return (
      <div className="sa">
        <p className="sa-note">Esta sesión no tiene análisis detallado (se guardó sin registro de movimiento). Estas son sus repeticiones:</p>
        <ol className="rep-list">
          {session.reps.map((r) => (
            <li key={r.rep_number}>
              <span className="num">#{r.rep_number}</span>
              <strong className="num">{deg(r.flexion)}</strong>
              {r.compensation_flags.length > 0 ? r.compensation_flags.map((f) => <span key={f} className="pill pill-warn">{f}</span>) : <span className="cell-mute">sin alertas</span>}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const s = a.summary;
  async function reanalyze() {
    setBusy(true);
    setProblem("");
    try {
      onChange?.(await api.reanalyzeSession(session.id));
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sa">
      <div className="kpi-grid sa-kpis">
        <Kpi label="Repeticiones" value={s.count} unit={s.expected ? ` de ${s.expected}` : ""} hint={`${s.reached_target} llegaron a la meta`} />
        <Kpi label="Mejor flexión" value={s.rom.best == null ? null : Math.round(s.rom.best)} unit="°" hint={`Meta ${Math.round(targetFlexion)}° · promedio ${s.rom.mean == null ? "—" : Math.round(s.rom.mean)}°`} />
        <Kpi label="Cambio en la sesión" value={s.rom.drop_pct == null ? null : `${s.rom.drop_pct > 0 ? "−" : "+"}${Math.abs(Math.round(s.rom.drop_pct))}`} unit={s.rom.drop_pct == null ? "" : " %"} hint={s.rom.drop_pct == null ? "Se necesitan al menos 6 repeticiones" : "Recorrido del último tercio frente al primero"} />
        <Kpi label="Ritmo" value={s.tempo.cycle_s == null ? null : String(s.tempo.cycle_s).replace(".", ",")} unit=" s" hint="Duración promedio de cada repetición" />
      </div>

      {s.count > 0 && (
        <section aria-label="Recorrido por repetición">
          <h4 className="sa-h">Recorrido por repetición</h4>
          <RepBars analysis={a} targetFlexion={targetFlexion} />
        </section>
      )}

      <section aria-label="Observaciones">
        <h4 className="sa-h">Observaciones del análisis</h4>
        <InsightList suggestions={a.suggestions} audience="therapist" />
        <p className="sa-note">Umbrales orientativos del análisis, no criterio clínico. La decisión sobre el plan es del fisioterapeuta.</p>
      </section>

      {a.reps.length > 0 && (
        <section aria-label="Detalle por repetición">
          <h4 className="sa-h">Detalle por repetición</h4>
          <div className="table-wrap">
            <table className="tbl sa-table">
              <thead><tr><th>#</th><th>Flexión</th><th>Subida</th><th>Sostén</th><th>Bajada</th><th>Alertas</th></tr></thead>
              <tbody>
                {a.reps.map((r) => (
                  <tr key={r.n}>
                    <td className="num">{r.n}</td>
                    <td className="num"><strong>{deg(r.flexion)}</strong> {!r.reached_target && <small className="cell-sub">no llegó</small>}</td>
                    <td className="num">{sec(r.up_s)}</td>
                    <td className="num">{sec(r.hold_s)}</td>
                    <td className="num">{sec(r.down_s)}</td>
                    <td>{r.flags.length ? r.flags.map((f) => <span key={f} className="pill pill-warn">{f}</span>) : <span className="cell-mute">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sa-note">Subida y bajada se miden del 10 al 90 % del recorrido; el sostén, mientras se mantiene sobre el 90 %.</p>
        </section>
      )}

      {session.has_trace && (
        <section aria-label="Reproducción del movimiento">
          <h4 className="sa-h">Movimiento</h4>
          {showReplay ? <SkeletonReplay sessionId={session.id} analysis={a} /> : (
            <button type="button" className="btn btn-ghost" onClick={() => setShowReplay(true)}><Icon name="play" size={16} /> Ver el movimiento</button>
          )}
        </section>
      )}

      <footer className="sa-foot">
        <span>Análisis versión {a.analyzer_version} · se vio la articulación el {a.visible_pct} % del tiempo · duración {String(a.duration_s).replace(".", ",")} s</span>
        {session.has_trace && <button type="button" className="btn btn-ghost btn-sm" onClick={reanalyze} disabled={busy}>{busy ? "Analizando…" : "Rehacer el análisis"}</button>}
      </footer>
      {problem && <p className="notice notice-error" role="alert">{problem}</p>}
    </div>
  );
}
