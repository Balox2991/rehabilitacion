import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { deg, greeting, shortName, sideLabel } from "../../lib/format.js";
import { PHASES } from "../../lib/labels.js";
import { averageProgress, doneToday, homeState, nextStep, progressMessage, sessionsLeft, weekTotals } from "../../lib/patientHome.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Achievements from "../../components/Achievements.jsx";
import CoachCard from "../../components/CoachCard.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../components/Icon.jsx";
import Journey from "../../components/Journey.jsx";
import PatientPage from "../../components/PatientPage.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import Disclaimer from "../../components/Disclaimer.jsx";
import { RoutineCard } from "../../components/ContentCards.jsx";
import WeekStrip from "../../charts/WeekStrip.jsx";
import StickDemo from "../../demos/StickDemo.jsx";
import { hasDemo } from "../../demos/demos.js";

const planDose = (p) => `${p.sets} ${p.sets === 1 ? "serie" : "series"} de ${p.reps_per_set}`;

// Portada del paciente: quién es, en qué punto de su recuperación está y tres cifras de ánimo.
function Hero({ patient, data, avg }) {
  const phase = patient.recovery_phase ? PHASES[patient.recovery_phase] : null;
  return (
    <header className="hp">
      <div className="hp-photo" aria-hidden="true" />
      <div className="container hp-in">
        <div className="hp-who">
          <Avatar patient={patient} size="xl" />
          <div className="hp-text">
            <p className="hp-kicker">Mi recuperación</p>
            <h1>{greeting()}, {shortName(patient.name)}</h1>
            <p className="hp-line">
              {patient.fracture_site}
              {patient.days_since_injury != null && ` · Día ${patient.days_since_injury}`}
              {phase && <> · <span className="hp-phase">Etapa de {phase.label.toLowerCase()}</span></>}
            </p>
            {phase && <p className="hp-hint">{phase.hint}</p>}
          </div>
        </div>
        <ul className="hp-stats" aria-label="Tu resumen">
          <li><strong className="num">{data.streak_days}</strong><span>{data.streak_days === 1 ? "día de racha" : "días de racha"}</span></li>
          <li><strong className="num">{data.totals.sessions}</strong><span>{data.totals.sessions === 1 ? "sesión" : "sesiones"}</span></li>
          <li><strong className="num">{avg == null ? "—" : `${avg}%`}</strong><span>de tu meta</span></li>
        </ul>
      </div>
    </header>
  );
}

// «Hoy»: lo único que el paciente necesita decidir al abrir la aplicación.
function Today({ pid, state, step, doneAlready }) {
  if (state === "pendiente") {
    const left = sessionsLeft(step);
    return (
      <section className="card today" aria-labelledby="h-today">
        <div className="today-copy">
          <p className="eyebrow">Tu siguiente paso</p>
          <h2 id="h-today">{step.exercise_name}</h2>
          <p className="today-sub">{sideLabel(step.side)} · {planDose(step)} · meta {deg(step.target_flexion)}</p>
          <p className="today-note">
            {left === 1 ? "Te falta 1 sesión" : `Te faltan ${left} sesiones`} de este ejercicio esta semana. Primero verás cómo se hace y después lo practicas con la cámara.
          </p>
          {doneAlready && <p className="today-done"><Icon name="check" size={16} /> Hoy ya hiciste una sesión.</p>}
          <div className="today-actions">
            <Link to={`/paciente/${pid}/ejercicio/${step.plan_id}`} className="btn btn-primary btn-lg">Ver cómo se hace y empezar</Link>
            <Link to={`/paciente/${pid}/ejercicio/${step.plan_id}?directo=1`} className="link-arrow">Ya lo sé, ir a la cámara <Icon name="arrow" size={16} /></Link>
          </div>
        </div>
        {hasDemo(step.exercise_code) && <div className="today-demo"><StickDemo demo={step.exercise_code} target={step.target_angle} compact /></div>}
      </section>
    );
  }
  const complete = state === "semana_completa";
  return (
    <section className="card today today-rest" aria-labelledby="h-today">
      <div className="today-copy">
        <p className="eyebrow">Tu siguiente paso</p>
        <h2 id="h-today">{complete ? "¡Completaste tus sesiones de la semana!" : "Aún no tienes ejercicios asignados"}</h2>
        <p className="today-note">
          {complete
            ? "Puedes descansar o reforzar con una rutina suave. Si algo te duele, mejor descansa y coméntaselo a tu fisioterapeuta."
            : "Tu fisioterapeuta te asignará un plan. Mientras tanto, mira la biblioteca para saber qué esperar."}
        </p>
        <div className="today-actions">
          <Link to={`/paciente/${pid}/rutinas`} className="btn btn-primary btn-lg">Ver rutinas</Link>
          <Link to={`/paciente/${pid}/aprender`} className="link-arrow">Abrir la biblioteca <Icon name="arrow" size={16} /></Link>
        </div>
      </div>
    </section>
  );
}

// Los ejercicios de la semana, cada uno con lo que falta y un botón para empezarlo.
function WeekCard({ pid, plans, days }) {
  const { done, planned } = weekTotals(plans);
  return (
    <section className="card panel" aria-labelledby="h-week">
      <div className="panel-head panel-head-row">
        <h2 id="h-week">Tu semana</h2>
        {planned > 0 && <span className="week-count num">{done} de {planned} sesiones</span>}
      </div>
      <WeekStrip days={days} />
      {plans.length > 0 && (
        <ul className="mp-list">
          {plans.map((p) => {
            const complete = sessionsLeft(p) === 0;
            return (
              <li key={p.plan_id} className="mp-row">
                {hasDemo(p.exercise_code) && <div className="mp-thumb" aria-hidden="true"><StickDemo demo={p.exercise_code} target={p.target_angle} compact /></div>}
                <div className="mp-main">
                  <strong className="mp-name">{p.exercise_name}</strong>
                  <span className="mp-meta">{sideLabel(p.side)} · {planDose(p)} · meta {deg(p.target_flexion)}</span>
                  <span className="mp-count num">{Math.min(p.done_7d, p.times_per_week)} de {p.times_per_week} esta semana</span>
                </div>
                {complete
                  ? <span className="pill pill-ok">Completo</span>
                  : <Link to={`/paciente/${pid}/ejercicio/${p.plan_id}`} className="btn btn-primary btn-sm">Empezar</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Avance hacia la meta: el anillo da la idea general; debajo, el recorrido de cada ejercicio con sus grados.
function GoalCard({ pid, plans, avg }) {
  return (
    <section className="card panel goal" aria-labelledby="h-goal">
      <div className="panel-head"><h2 id="h-goal">Tu avance</h2></div>
      <div className="goal-top">
        <ProgressRing value={avg} size={104} stroke={10} label="de tu meta" />
        <p className="goal-msg">{progressMessage(avg)}</p>
      </div>
      {plans.length > 0 && <div className="goal-list">{plans.map((p) => <Journey key={p.plan_id} plan={p} compact />)}</div>}
      <Link to={`/paciente/${pid}/progreso`} className="link-arrow">Ver mi progreso completo <Icon name="arrow" size={16} /></Link>
    </section>
  );
}

// Cuándo parar y avisar. El texto sale del contenido verificado «Dolor, hinchazón y señales de alerta» de la biblioteca.
function SafetyCard({ pid }) {
  return (
    <section className="card panel safety" aria-labelledby="h-safety">
      <div className="panel-head"><h2 id="h-safety"><Icon name="alert" size={18} /> Cuándo parar y avisar</h2></div>
      <ul className="safety-list">
        <li><strong>Para y avisa</strong> si el dolor aumenta durante el ejercicio o no cede al descansar.</li>
        <li><strong>Avisa de inmediato</strong>, o busca atención urgente, si notas fiebre, hinchazón que aumenta, hormigueo, pérdida de sensibilidad o cambio de color en los dedos.</li>
      </ul>
      <Link to={`/paciente/${pid}/aprender/edu_pain_swelling`} className="link-arrow">Leer las señales de alerta <Icon name="arrow" size={16} /></Link>
    </section>
  );
}

export default function Home() {
  const { pid } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.patientOverview(pid), [pid]);
  const coach = useAsync(() => api.coach(pid), [pid]); // si falla, simplemente no se muestra: no es lo esencial del inicio

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { patient, plans, routines, last_7_days: days } = data;
  const state = homeState(plans);
  const step = nextStep(plans);
  const suggested = [
    ...routines.assigned.map((r) => ({ ...r, tag: "Asignada por tu fisioterapeuta" })),
    ...routines.recommended.map((r) => ({ ...r, tag: "Sugerida para ti" })),
  ].slice(0, 2);

  const avg = averageProgress(plans);

  return (
    <>
      <Hero patient={patient} data={data} avg={avg} />
      <PatientPage className="overlap">
        <div className="home-grid">
          <div className="home-main">
            <Today pid={pid} state={state} step={step} doneAlready={doneToday(days)} />
            {(coach.data?.plans ?? []).filter((c) => c.session_id).slice(0, 2).map((c) => (
              <CoachCard key={c.plan_id} plan={c} evidence={coach.data.evidence} pid={pid} libraryCode={c.library_code} />
            ))}
            <WeekCard pid={pid} plans={plans} days={days} />
            {suggested.length > 0 && (
              <section aria-labelledby="h-rut">
                <div className="section-row">
                  <h2 className="section-h" id="h-rut">Rutinas para ti</h2>
                  <Link to={`/paciente/${pid}/rutinas`} className="link-arrow">Ver todas <Icon name="arrow" size={16} /></Link>
                </div>
                <div className="routine-list">
                  {suggested.map((r) => <RoutineCard key={r.code} routine={r} tag={r.tag} to={`/paciente/${pid}/rutinas/${r.code}`} />)}
                </div>
              </section>
            )}
          </div>
          <aside className="home-side">
            <GoalCard pid={pid} plans={plans} avg={avg} />
            <Achievements data={data} compact />
            <SafetyCard pid={pid} />
          </aside>
        </div>
        <Disclaimer />
      </PatientPage>
    </>
  );
}
