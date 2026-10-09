import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { AREAS, CATEGORIES, areaLabel, phaseLabel } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import { ExerciseCard } from "../../components/ContentCards.jsx";
import DemoPanel from "../../components/DemoPanel.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import EvidenceList from "../../components/EvidenceList.jsx";
import Disclaimer from "../../components/Disclaimer.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import PatientPage from "../../components/PatientPage.jsx";

// Biblioteca de ejercicios: la usa el paciente (`base` = /paciente/:id/aprender) y el fisioterapeuta (`base` = /fisio/:id/biblioteca).
export function LibraryBrowser({ base, therapist = false }) {
  const { data, error, loading, reload } = useAsync(() => api.library(), []);
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (i) => (!area || i.body_area === area) && (!category || i.category === category) && (!needle || `${i.title} ${i.summary}`.toLowerCase().includes(needle))
    );
  }, [data, area, category, q]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="lib">
      <div className="filters">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">Buscar ejercicios</span>
          <input type="search" placeholder="Buscar un ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Filtrar por zona del cuerpo">
          <button className={`chip ${area === "" ? "is-on" : ""}`} aria-pressed={area === ""} onClick={() => setArea("")}>Todas las zonas</button>
          {Object.entries(AREAS).filter(([k]) => k !== "general").map(([k, label]) => (
            <button key={k} className={`chip ${area === k ? "is-on" : ""}`} aria-pressed={area === k} onClick={() => setArea(k)}>{label}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Filtrar por tipo">
          <button className={`chip ${category === "" ? "is-on" : ""}`} aria-pressed={category === ""} onClick={() => setCategory("")}>Todo</button>
          {Object.entries(CATEGORIES).map(([k, label]) => (
            <button key={k} className={`chip ${category === k ? "is-on" : ""}`} aria-pressed={category === k} onClick={() => setCategory(k)}>{label}</button>
          ))}
        </div>
      </div>

      <p className="result-count" role="status">{shown.length} {shown.length === 1 ? "resultado" : "resultados"}</p>
      {shown.length === 0 ? (
        <EmptyState icon="search" title="No encontramos ejercicios con esos filtros">Prueba quitando alguno o buscando con otras palabras.</EmptyState>
      ) : (
        <div className="ex-grid-cards">
          {shown.map((i) => <ExerciseCard key={i.code} item={i} to={`${base}/${i.code}`} />)}
        </div>
      )}
      {!therapist && <Disclaimer />}
    </div>
  );
}

export function Library() {
  const { pid } = useParams();
  return (
    <PatientPage>
      <PageHeader
        title="Biblioteca de ejercicios"
        description="Mira cómo se hace cada ejercicio antes de practicarlo, y lee qué cuidados tener. Los que dicen «Con cámara» los mide la aplicación por ti."
      />
      <LibraryBrowser base={`/paciente/${pid}/aprender`} />
    </PatientPage>
  );
}

export function LibraryItem() {
  const { pid, code } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [item, overview] = await Promise.all([api.libraryItem(code), api.patientOverview(pid)]);
    return { item, overview };
  }, [code, pid]);

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { item, overview } = data;
  const plan = overview.plans.find((p) => p.library_code === item.code);
  const educational = item.category === "educacion";

  return (
    <PatientPage>
      <PageHeader back={{ to: `/paciente/${pid}/aprender`, label: "Volver a la biblioteca" }} title={item.title} description={item.summary}>
        <div className="ex-tags">
          <span className="pill pill-mute">{areaLabel(item.body_area)}</span>
          {!educational && <span className="tag">Etapa: {phaseLabel(item.phase)}</span>}
          <span className="tag"><Icon name="clock" size={14} /> {item.duration_min} min</span>
        </div>
      </PageHeader>

      {educational ? (
        <div className="card panel edu-body">
          <ul className="edu-points">{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {item.cautions.map((c, i) => <p key={i} className="edu-note">{c}</p>)}
        </div>
      ) : (
        <DemoPanel item={item} target={plan?.target_angle} />
      )}

      {plan && (
        <div className="card panel cta-card">
          <div>
            <h2 className="card-title">Este ejercicio está en tu plan</h2>
            <p className="card-sub">Meta de {Math.round(plan.target_flexion)}° · {plan.done_7d} de {plan.times_per_week} sesiones esta semana</p>
          </div>
          <Link to={`/paciente/${pid}/ejercicio/${plan.plan_id}`} className="btn btn-primary">Practicar con la cámara</Link>
        </div>
      )}

      {item.evidence.length > 0 && (
        <section className="evidence-section" aria-labelledby="h-ev">
          <h2 className="section-h" id="h-ev">Respaldo científico</h2>
          <p className="card-sub">Estudios que dan contexto a este ejercicio. Ninguno evalúa esta aplicación.</p>
          <EvidenceList items={item.evidence} />
        </section>
      )}
      <Disclaimer />
    </PatientPage>
  );
}
