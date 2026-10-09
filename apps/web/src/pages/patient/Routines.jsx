import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { dosage } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import { RoutineCard } from "../../components/ContentCards.jsx";
import Disclaimer from "../../components/Disclaimer.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import PatientPage from "../../components/PatientPage.jsx";
import StickDemo from "../../demos/StickDemo.jsx";
import { hasDemo } from "../../demos/demos.js";

export function Routines() {
  const { pid } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [overview, all] = await Promise.all([api.patientOverview(pid), api.routines()]);
    return { overview, all };
  }, [pid]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { assigned, recommended } = data.overview.routines;
  const taken = new Set([...assigned, ...recommended].map((r) => r.code));
  const others = data.all.filter((r) => !taken.has(r.code));

  return (
    <PatientPage>
      <PageHeader
        title="Rutinas de ejercicios"
        description="Conjuntos de ejercicios pensados para trabajar juntos. Tu fisioterapeuta te asigna las que necesitas; puedes explorar las demás para saber qué viene."
      />
      <Group title="Asignadas por tu fisioterapeuta" empty="Todavía no tienes rutinas asignadas." items={assigned} pid={pid} tag="Asignada" />
      <Group title="Sugeridas para ti" hint="Según la articulación de tu plan y tu etapa de recuperación." empty="Por ahora no hay sugerencias nuevas." items={recommended} pid={pid} tag="Sugerida" />
      {others.length > 0 && <Group title="Otras rutinas" items={others} pid={pid} />}
      <Disclaimer />
    </PatientPage>
  );
}

function Group({ title, hint, items, empty, pid, tag }) {
  return (
    <section className="group">
      <h2 className="section-h">{title}</h2>
      {hint && <p className="group-hint">{hint}</p>}
      {items.length === 0 ? (
        <p className="group-empty">{empty}</p>
      ) : (
        <div className="routine-list">
          {items.map((r) => <RoutineCard key={r.code} routine={r} tag={tag} to={`/paciente/${pid}/rutinas/${r.code}`} />)}
        </div>
      )}
    </section>
  );
}

// Detalle de una rutina. Lo usan el paciente y el fisioterapeuta (cada uno con sus propios enlaces y su propio contenedor).
export function RoutineView({ code, backTo, backLabel, itemBase }) {
  const { data, error, loading, reload } = useAsync(() => api.routine(code), [code]);
  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const r = data;

  return (
    <>
      <PageHeader back={{ to: backTo, label: backLabel }} title={r.title} description={r.summary}>
        <p className="header-meta"><Icon name="clock" size={15} /> {r.duration_min} min · {r.items.length} ejercicios</p>
      </PageHeader>

      <ol className="routine-steps">
        {r.items.map((it) => (
          <li key={it.position} className="card routine-step">
            <span className="step-n" aria-hidden="true">{it.position}</span>
            <div className="routine-step-media">
              {hasDemo(it.demo) ? <StickDemo demo={it.demo} compact /> : <span className="ex-card-fallback"><Icon name={it.category === "educacion" ? "book" : "list"} size={30} /></span>}
            </div>
            <div className="routine-step-body">
              <h3>{it.title}</h3>
              <p className="dose">{dosage(it)}</p>
              {it.note && <p className="pill pill-mute step-note">{it.note}</p>}
              <p className="card-sub">{it.summary}</p>
              <Link to={`${itemBase}/${it.code}`} className="link-arrow">Ver cómo se hace <Icon name="arrow" size={16} /></Link>
            </div>
          </li>
        ))}
      </ol>
      <Disclaimer>Las series y repeticiones son un punto de partida habitual. La dosis la ajusta el equipo tratante para cada paciente, y los ejercicios marcados con condiciones solo se hacen cuando el equipo lo autorice.</Disclaimer>
    </>
  );
}

export function RoutineDetail() {
  const { pid, code } = useParams();
  return (
    <PatientPage>
      <RoutineView code={code} backTo={`/paciente/${pid}/rutinas`} backLabel="Volver a las rutinas" itemBase={`/paciente/${pid}/aprender`} />
    </PatientPage>
  );
}
