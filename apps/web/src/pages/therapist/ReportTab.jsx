import { useOutletContext } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { deg, formatDay, formatTime, pctText, sideLabel } from "../../lib/format.js";
import { phaseLabel } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Icon from "../../components/Icon.jsx";
import RomChart from "../../charts/RomChart.jsx";
import WeeklyBars from "../../charts/WeeklyBars.jsx";

const longDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

// Informe de evolución para imprimir o guardar como PDF (Ctrl+P → «Guardar como PDF»).
// Todos los números vienen de GET /patients/:id/report; aquí solo se presentan.
export default function ReportTab() {
  const { pid } = useOutletContext();
  const { data, error, loading, reload } = useAsync(() => api.report(pid), [pid]);
  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { patient, summary, plans, weekly, notes, routines } = data;

  return (
    <div className="tab-body">
      <div className="report-actions no-print">
        <p className="card-sub">Vista previa del informe. Usa «Guardar como PDF» en el cuadro de impresión.</p>
        <button className="btn btn-primary" onClick={() => window.print()}><Icon name="print" size={18} /> Imprimir o guardar PDF</button>
      </div>

      <article className="report card">
        <header className="report-head">
          <img src="/brand/logo-completo.png" alt="Clínica Ocaña — App rehabilitación física" className="report-logo" />
          <div className="report-title">
            <p className="eyebrow">Informe de evolución</p>
            <h2>{patient.name}</h2>
            <p>Generado el {longDate.format(new Date(data.generated_at))}</p>
          </div>
        </header>

        <dl className="report-facts">
          <div><dt>Lesión</dt><dd>{patient.fracture_site ?? "—"}</dd></div>
          <div><dt>Días de recuperación</dt><dd className="num">{patient.days_since_injury ?? "—"}</dd></div>
          <div><dt>Etapa</dt><dd>{phaseLabel(patient.recovery_phase)}</dd></div>
          <div><dt>Fisioterapeuta</dt><dd>{patient.therapist_name ?? "—"}</dd></div>
          <div><dt>Sesiones registradas</dt><dd className="num">{summary.sessions}</dd></div>
          <div><dt>Repeticiones</dt><dd className="num">{summary.reps}</dd></div>
          <div><dt>Adherencia, 8 semanas</dt><dd className="num">{pctText(summary.adherence_8w_pct)}</dd></div>
          <div><dt>Repeticiones con alerta, 30 d</dt><dd className="num">{summary.compensation_rate_30d_pct == null ? "—" : `${summary.compensation_rate_30d_pct}%`}</dd></div>
        </dl>

        <section>
          <h3>Rango de movimiento por ejercicio</h3>
          {plans.length === 0 ? <p className="card-sub">Sin ejercicios con cámara prescritos.</p> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Ejercicio</th><th>Inicio</th><th>Actual</th><th>Mejor</th><th>Cambio</th><th>Meta</th><th>Progreso</th></tr></thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.plan_id}>
                      <td>{p.exercise_name}<small className="cell-sub">{sideLabel(p.side)} · {p.sessions} sesiones</small></td>
                      <td className="num">{deg(p.baseline_flexion)}</td>
                      <td className="num"><strong>{deg(p.latest_flexion)}</strong></td>
                      <td className="num">{deg(p.best_flexion)}</td>
                      <td className="num">{p.change_flexion == null ? "—" : `${p.change_flexion > 0 ? "+" : ""}${p.change_flexion}°`}</td>
                      <td className="num">{deg(p.target_flexion)}</td>
                      <td className="num">{pctText(p.progress_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plans.map((p) => (
            <figure key={p.plan_id} className="report-fig">
              <figcaption>{p.exercise_name} — mejor repetición de cada sesión (grados de flexión)</figcaption>
              <RomChart history={p.history} targetFlexion={p.target_flexion} gradientId={`rep-${p.plan_id}`} />
            </figure>
          ))}
        </section>

        <section>
          <h3>Constancia</h3>
          <figure className="report-fig">
            <figcaption>Sesiones por semana, últimas 8 semanas (plan actual: {weekly[0]?.planned ?? 0} por semana)</figcaption>
            <WeeklyBars weeks={weekly} />
          </figure>
        </section>

        {routines.length > 0 && (
          <section>
            <h3>Rutinas asignadas</h3>
            <ul className="plain-list">{routines.map((r) => <li key={r.assignment_id}>{r.title}</li>)}</ul>
          </section>
        )}

        <section>
          <h3>Notas clínicas recientes</h3>
          {notes.length === 0 ? <p className="card-sub">Sin notas.</p> : (
            <ul className="report-notes">
              {notes.slice(0, 5).map((n) => (
                <li key={n.id}><span className="cell-mute">{formatDay(n.created_at)} · {formatTime(n.created_at)} · {n.author_name}</span><p>{n.body}</p></li>
              ))}
            </ul>
          )}
        </section>

        <footer className="report-foot">
          <p><strong>Cómo leer este informe.</strong> Los ángulos los mide una cámara común con el modelo de detección de pose MediaPipe: son estimaciones con margen de error, más fiables en rodilla, codo y hombro con buena luz y a poca distancia (ver «Evidencia clínica»). No reemplazan la medición con goniómetro ni la valoración clínica.</p>
          <p>La flexión es el movimiento logrado con 0° en reposo. La adherencia compara las sesiones hechas con las del plan activo actual en cada semana. Datos de demostración.</p>
        </footer>
      </article>
    </div>
  );
}
