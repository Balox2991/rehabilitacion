import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { areaLabel, phaseLabel } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import { RoutineCard } from "../../components/ContentCards.jsx";
import DemoPanel from "../../components/DemoPanel.jsx";
import EvidenceList from "../../components/EvidenceList.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import { LibraryBrowser } from "../patient/Library.jsx";
import { RoutineView } from "../patient/Routines.jsx";

export default function TherapistLibrary() {
  const { tid } = useParams();
  const [view, setView] = useState("ejercicios");
  const routines = useAsync(() => api.routines(), []);

  return (
    <div className="stack">
      <PageHeader title="Contenido para tus pacientes" description="Lo que ven tus pacientes: ejercicios con demostración, rutinas y contenido educativo. Puedes asociar el video de tu clínica a cada ejercicio." />
      <div className="tabs" role="tablist" aria-label="Contenido">
        <button role="tab" aria-selected={view === "ejercicios"} className={`tab ${view === "ejercicios" ? "active" : ""}`} onClick={() => setView("ejercicios")}>Ejercicios</button>
        <button role="tab" aria-selected={view === "rutinas"} className={`tab ${view === "rutinas" ? "active" : ""}`} onClick={() => setView("rutinas")}>Rutinas</button>
      </div>

      {view === "ejercicios" ? (
        <LibraryBrowser base={`/fisio/${tid}/biblioteca`} therapist />
      ) : routines.loading ? <Loading rows={2} /> : routines.error ? <ErrorState error={routines.error} onRetry={routines.reload} /> : (
        <div className="routine-list">
          {routines.data.map((r) => <RoutineCard key={r.code} routine={r} to={`/fisio/${tid}/biblioteca/rutinas/${r.code}`} />)}
        </div>
      )}
    </div>
  );
}

export function TherapistRoutine() {
  const { tid, code } = useParams();
  return (
    <div className="stack">
      <RoutineView code={code} backTo={`/fisio/${tid}/biblioteca`} backLabel="Volver a la biblioteca" itemBase={`/fisio/${tid}/biblioteca`} />
    </div>
  );
}

export function TherapistLibraryItem() {
  const { tid, code } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.libraryItem(code), [code]);
  const [url, setUrl] = useState(null); // null = aún no editado: se muestra el valor guardado
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const item = data;
  const value = url ?? item.video_url ?? "";
  const educational = item.category === "educacion";

  async function save(next) {
    setSaving(true);
    setProblem("");
    setSavedMsg("");
    try {
      await api.setVideo(item.code, next);
      setUrl(null);
      setSavedMsg(next ? "Video guardado. Tus pacientes ya lo ven en este ejercicio." : "Video quitado.");
      reload();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader back={{ to: `/fisio/${tid}/biblioteca`, label: "Volver a la biblioteca" }} title={item.title} description={item.summary}>
        <div className="ex-tags">
          <span className="pill pill-mute">{areaLabel(item.body_area)}</span>
          {!educational && <span className="tag">Etapa: {phaseLabel(item.phase)}</span>}
          {item.tracked_exercise_code ? <span className="tag"><Icon name="camera" size={14} /> Se mide con cámara</span> : !educational && <span className="tag">Guiado, sin medición</span>}
        </div>
      </PageHeader>

      {educational ? (
        <div className="card panel edu-body">
          <ul className="edu-points">{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {item.cautions.map((c, i) => <p key={i} className="edu-note">{c}</p>)}
        </div>
      ) : (
        <>
          <DemoPanel item={item} />
          <section className="card panel video-editor" aria-labelledby="h-video">
            <h2 className="card-title" id="h-video">Video de tu clínica</h2>
            <p className="card-sub">Pega un enlace de YouTube o Vimeo (https). Se verá junto a la demostración, en el paso «Mira cómo se hace».</p>
            <div className="video-row">
              <label className="sr-only" htmlFor="video-url">Enlace del video</label>
              <input id="video-url" type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" value={value} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={() => save(value.trim())} disabled={saving || !value.trim() || value.trim() === (item.video_url ?? "")}>Guardar</button>
              {item.video_url && <button className="btn btn-ghost btn-sm" onClick={() => save(null)} disabled={saving}>Quitar</button>}
            </div>
            {problem && <p className="notice notice-error" role="alert">{problem}</p>}
            {savedMsg && <p className="notice notice-info" role="status">{savedMsg}</p>}
            <p className="card-sub">La app no incluye videos reales de ejercicios: la demostración animada es un esquema del movimiento. Lo ideal es grabar los videos con tu propio equipo o contar con licencia para usarlos.</p>
          </section>
        </>
      )}

      {item.evidence.length > 0 && (
        <section className="evidence-section" aria-labelledby="h-ev">
          <h2 className="section-h" id="h-ev">Respaldo científico</h2>
          <EvidenceList items={item.evidence} />
        </section>
      )}
    </div>
  );
}
