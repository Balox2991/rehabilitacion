import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { VIEW_ADVICE_TEXT, bodyPartOf, exerciseOf, setupTips } from "../../lib/exercise.js";
import { saveSessionSafely } from "../../lib/saveSession.js";
import { useAsync } from "../../lib/useAsync.js";
import { deg, sideLabel } from "../../lib/format.js";
import { newAchievements, nextStep, setProgress } from "../../lib/patientHome.js";
import { buildSessionPayload } from "../../lib/sessionPayload.js";
import { flexionFromAngle } from "../../lib/rom.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import DemoPanel from "../../components/DemoPanel.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import CoachCard from "../../components/CoachCard.jsx";
import InsightList from "../../components/InsightList.jsx";
import PatientPage from "../../components/PatientPage.jsx";
import RepBars from "../../components/RepBars.jsx";
import VideoUpload from "../../components/VideoUpload.jsx";
import { useTracking } from "../../tracking/useTracking.js";

const STEPS = [
  { id: "ver", label: "Mira cómo se hace" },
  { id: "practicar", label: "Haz tu serie" },
  { id: "listo", label: "Listo" },
];

function Stepper({ current }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="stepper" aria-label={`Paso ${at + 1} de ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <li key={s.id} className={i < at ? "is-done" : i === at ? "is-current" : ""} aria-current={i === at ? "step" : undefined}>
          <span className="stepper-n" aria-hidden="true">{i < at ? <Icon name="check" size={14} /> : i + 1}</span>
          <span className="stepper-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

// Aviso permanente mientras se practica: la app cuenta repeticiones, no siente dolor.
function SafetyStrip() {
  return (
    <p className="safety-strip" role="note">
      <Icon name="alert" size={18} />
      <span>Si sientes dolor agudo, mareo u hormigueo, <strong>detente y avisa a tu fisioterapeuta</strong>.</span>
    </p>
  );
}

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Cada ejercicio es un flujo nuevo: con `key`, pasar de un ejercicio al siguiente reinicia el paso y la sesión guardada
// (sin esto, «Siguiente: …» mostraría todavía la pantalla «Listo» del ejercicio anterior).
export default function ExerciseFlow() {
  const { planId } = useParams();
  return <Flow key={planId} />;
}

// Flujo guiado de un ejercicio del plan: primero se ve la demostración, después se practica con la cámara.
function Flow() {
  const { pid, planId } = useParams();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const overview = await api.patientOverview(pid);
    const plan = overview.plans.find((p) => String(p.plan_id) === planId) ?? null;
    const item = plan?.library_code ? await api.libraryItem(plan.library_code) : null;
    return { overview, plan, item };
  }, [pid, planId]);
  const [step, setStep] = useState(params.get("directo") ? "practicar" : "ver");
  const [saved, setSaved] = useState(null);

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { overview, plan, item } = data;
  if (!plan) {
    return (
      <PatientPage>
        <div className="notice notice-info">Este plan no existe o ya no está activo. <Link to={`/paciente/${pid}`}>Volver a mi recuperación</Link></div>
      </PatientPage>
    );
  }
  const current = saved ? "listo" : step === "subir" ? "practicar" : step;

  return (
    <PatientPage>
      <PageHeader
        back={{ to: `/paciente/${pid}`, label: "Volver a mi recuperación" }}
        title={plan.exercise_name}
        description={`${cap(sideLabel(plan.side))} · meta de ${deg(plan.target_flexion)} de flexión · ${plan.sets} ${plan.sets === 1 ? "serie" : "series"} de ${plan.reps_per_set}`}
      />
      <Stepper current={current} />

      {current === "ver" && (
        <>
          <section className="stack-tight" aria-labelledby="h-ver">
            <h2 className="section-h" id="h-ver">Antes de empezar, mira cómo se hace</h2>
            {item ? <DemoPanel item={item} target={plan.target_angle} /> : <div className="notice notice-info">Este ejercicio aún no tiene ficha en la biblioteca.</div>}
          </section>
          <section className="card panel prep" aria-labelledby="h-prep">
            <div className="panel-head"><h2 id="h-prep">Prepara tu espacio</h2></div>
            <ul>{setupTips(exerciseOf(plan)).map((tip) => <li key={tip}>{tip}</li>)}</ul>
          </section>
          <div className="flow-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setStep("practicar")}>Ya lo vi, practicar con la cámara</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setStep("subir")}>Tengo un video grabado</button>
            <Link to={`/paciente/${pid}`} className="btn btn-quiet">Ahora no</Link>
          </div>
        </>
      )}

      {step === "subir" && !saved && <VideoUpload pid={pid} plan={plan} exercise={exerciseOf(plan)} onSaved={setSaved} onBack={() => setStep("ver")} />}
      {current === "practicar" && step !== "subir" && <Practice pid={pid} plan={plan} item={item} onSaved={setSaved} onBack={() => setStep("ver")} debug={params.get("debug") === "1"} />}
      {current === "listo" && <Done pid={pid} overview={overview} plan={plan} session={saved} />}
    </PatientPage>
  );
}

// Herramienta técnica (solo con ?debug=1): descarga la serie de ángulos de la sesión, junto con las repeticiones que la
// persona contó a mano, para comparar con las que contó la aplicación. Son solo números: no incluye video ni imágenes.
function TraceTools({ t }) {
  const [manual, setManual] = useState("");
  function download() {
    const trace = t.exportTrace(manual === "" ? null : Number(manual));
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sesion-${trace.meta.exercise}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="card panel trace-tools" aria-label="Herramientas técnicas">
      <div className="panel-head"><h2>Registro técnico</h2><p>Modelo: {t.model ?? "—"} · Cuenta la aplicación: {t.reps}</p></div>
      <label className="trace-field">Repeticiones que hiciste de verdad
        <input type="number" min="0" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} />
      </label>
      <button type="button" className="btn btn-ghost" onClick={download}>Descargar registro (JSON)</button>
    </section>
  );
}

function Practice({ pid, plan, item, onSaved, onBack, debug }) {
  const exercise = useMemo(() => exerciseOf(plan), [plan]);
  const t = useTracking({ exercise, side: plan.side, targetAngle: plan.target_angle });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const prog = setProgress(t.reps, plan.sets, plan.reps_per_set);
  const flex = t.angle == null ? null : flexionFromAngle(exercise.direction, t.angle);
  const running = t.phase === "running";
  const resting = running && t.reps > 0 && !prog.complete && prog.repInSet === 0; // acaba de cerrar una serie

  const checklist = useMemo(
    () => [
      { label: "Enciende la cámara", done: running },
      { label: "Calibra tu postura de reposo", done: t.calibrated },
      { label: `Completa tus ${plan.sets} ${plan.sets === 1 ? "serie" : "series"} de ${plan.reps_per_set}`, done: prog.complete },
    ],
    [running, t.calibrated, prog.complete, plan.sets, plan.reps_per_set]
  );

  async function finish() {
    const snap = t.snapshot();
    setSaving(true);
    setSaveError("");
    try {
      // El dato guardado sale del análisis posterior del registro completo; si algo falla se conserva el conteo en vivo.
      const { body } = buildSessionPayload({ plan, snap, trace: t.buildTrace() });
      const session = await saveSessionSafely(pid, body); // si el servidor rechaza el registro, la sesión se guarda sin él
      t.stop();
      onSaved(session);
    } catch (err) {
      setSaveError(err.message); // la sesión sigue en pantalla: se puede reintentar sin perder las repeticiones
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ex-grid">
      <div className="ex-left">
        <section className="stage card" aria-label="Cámara">
          <div className="stage-frame">
            <video ref={t.videoRef} className="stage-video" playsInline muted />
            <canvas ref={t.canvasRef} className="stage-canvas" />
            {!running && (
              <div className="stage-idle">
                <p>{t.phase === "loading" ? t.message : "La cámara está apagada"}</p>
                {t.phase === "error" && <p className="stage-error" role="alert">{t.message}</p>}
              </div>
            )}
            {running && (
              <>
                <div className="stage-hud" aria-live="off">
                  <span className="hud-label">Flexión</span>
                  <strong className="num">{flex == null ? "—" : `${Math.round(flex)}°`}</strong>
                  <small className="num">ángulo articular {t.angle == null ? "—" : `${t.angle.toFixed(0)}°`}</small>
                </div>
                <div className="stage-reps" aria-live="off">
                  <span className="hud-label">Repeticiones</span>
                  <strong className="num">{t.reps}<small> / {prog.total}</small></strong>
                </div>
              </>
            )}
            {running && !t.visible && <div className="stage-alert stage-alert-view" role="status">No veo bien tu {bodyPartOf(exercise)}. Aléjate un poco y que se vea toda la extremidad.</div>}
            {running && t.visible && t.viewAdvice && <div className="stage-alert stage-alert-view" role="status">{VIEW_ADVICE_TEXT[t.viewAdvice]}</div>}
            {running && t.visible && !t.viewAdvice && t.flags.length > 0 && <div className="stage-alert" role="status">Posible compensación: {t.flags.join(", ")}</div>}
          </div>
          <p className="stage-msg" role="status">{running ? t.message : "Colócate de perfil o de frente según el ejercicio, con buena luz y toda la extremidad visible."}</p>
          <div className="stage-actions">
            {!running ? (
              <button className="btn btn-primary btn-lg" onClick={t.start} disabled={t.phase === "loading"}>{t.phase === "loading" ? "Preparando…" : "Encender cámara"}</button>
            ) : (
              <>
                <button className={`btn ${t.calibrated ? "btn-ghost" : "btn-primary"} btn-lg`} onClick={t.calibrate}>{t.calibrated ? "Recalibrar reposo" : "Calibrar reposo"}</button>
                <button className="btn btn-ghost btn-lg" onClick={t.stop}>Apagar cámara</button>
              </>
            )}
            <button className="btn btn-quiet" onClick={onBack}>Ver la demostración otra vez</button>
          </div>
        </section>
        <SafetyStrip />
        {debug && <TraceTools t={t} />}
      </div>

      <aside className="ex-side">
        <section className="card panel session" aria-label="Tu sesión">
          <span className="kpi-label">Serie {prog.set} de {plan.sets}</span>
          <p className="session-count num">
            {prog.complete ? "¡Completaste todas tus series!" : `Llevas ${prog.repInSet} de ${plan.reps_per_set} en esta serie`}
          </p>
          <div className="meter" role="img" aria-label={`${t.reps} de ${prog.total} repeticiones`}><span style={{ width: `${Math.min(100, (t.reps / prog.total) * 100)}%` }} /></div>
          {resting && <p className="session-rest">Buen trabajo. Descansa un momento antes de la siguiente serie.</p>}
          <span className={`pill ${t.inTarget ? "pill-ok" : "pill-mute"}`}>{t.inTarget ? "En rango objetivo" : "En reposo"}</span>
        </section>

        <section className="card panel" aria-label="Pasos">
          <div className="panel-head"><h2>Pasos</h2></div>
          <ol className="checklist">
            {checklist.map((s) => <li key={s.label} className={s.done ? "is-done" : ""}><span aria-hidden="true">{s.done ? "✓" : ""}</span>{s.label}</li>)}
          </ol>
        </section>

        <section className="card panel">
          <button className={`btn ${prog.complete ? "btn-primary" : "btn-ghost"} btn-lg btn-block`} onClick={finish} disabled={t.reps < 1 || saving}>{saving ? "Guardando…" : "Terminar y guardar sesión"}</button>
          <p className="card-sub save-hint">
            {t.reps < 1 ? "Completa al menos una repetición para poder guardar." : prog.complete ? "Ya hiciste todas tus repeticiones." : "Si lo necesitas, puedes terminar antes: se guardan las repeticiones que hiciste."}
          </p>
          {saveError && <p className="notice notice-error" role="alert">No se pudo guardar: {saveError}. Tus repeticiones siguen aquí; intenta de nuevo.</p>}
        </section>

        {item && (
          <details className="peek card panel">
            <summary>Recordatorio de los pasos y precauciones</summary>
            <ol className="steps-list">{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <ul className="cautions-inline">{item.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </details>
        )}
      </aside>
    </div>
  );
}

// Lo que el paciente ve de su análisis: una barra por repetición y hasta dos observaciones en lenguaje llano.
function SessionResult({ session, plan }) {
  const a = session.analysis;
  const targetFlexion = session.direction === "decreasing" ? 180 - plan.target_angle : plan.target_angle;
  if (a.summary.count === 0) return <InsightList suggestions={a.suggestions} audience="patient" limit={2} />;
  return (
    <section className="done-result" aria-label="Tu sesión en detalle">
      <h3>Tu sesión repetición por repetición</h3>
      <RepBars analysis={a} targetFlexion={targetFlexion} />
      <InsightList suggestions={a.suggestions} audience="patient" limit={2} />
    </section>
  );
}

// «Para tu próxima sesión»: recomendaciones del asistente con el análisis del video que acaba de hacer y su historial.
function SessionCoach({ pid, plan, session }) {
  const { data } = useAsync(() => api.coach(pid, { session: session.id }), [pid, session.id]);
  const mine = data?.plans.find((p) => p.plan_id === plan.plan_id);
  if (!mine) return null; // si el asistente falla o no tiene nada que decir, la pantalla de resultado queda igual
  return <CoachCard plan={mine} evidence={data.evidence} pid={pid} libraryCode={mine.library_code} title="Tu asistente: para la próxima sesión" />;
}

function Done({ pid, overview, plan, session }) {
  const { patient, plans } = overview;
  const following = nextStep(plans, plan.plan_id); // el ejercicio que más le falta, sin contar el que acaba de hacer
  const unlocked = newAchievements(overview, plan.plan_id, session);
  return (
    <>
      <section className="card panel done-card" aria-labelledby="h-done">
        <span className="done-check" aria-hidden="true"><Icon name="check" size={30} /></span>
        <p className="eyebrow">Sesión guardada</p>
        <h2 id="h-done">¡Buen trabajo, {patient.name.split(" ")[0]}!</h2>
        <div className="done-stats">
          <div><strong className="num">{session.reps_completed}</strong><span>repeticiones</span></div>
          <div><strong className="num">{deg(session.flexion)}</strong><span>mejor flexión (meta {deg(plan.target_flexion)})</span></div>
          <div><strong className="num">{session.compensation_count}</strong><span>con postura por revisar</span></div>
        </div>
        {session.analysis && <SessionResult session={session} plan={plan} />}
        {unlocked.length > 0 && (
          <div className="done-ach" role="status">
            <strong>{unlocked.length === 1 ? "¡Nuevo logro!" : "¡Nuevos logros!"}</strong>
            <ul>{unlocked.map((a) => <li key={a.id}><span aria-hidden="true"><Icon name={a.icon} size={16} /></span>{a.title}</li>)}</ul>
          </div>
        )}
        {session.compensation_count > 0 && <p className="done-tip">Algunas repeticiones tuvieron la postura por revisar. La próxima vez ve más despacio y mantén el tronco quieto.</p>}
        <div className="flow-actions">
          {following && <Link to={`/paciente/${pid}/ejercicio/${following.plan_id}`} className="btn btn-primary btn-lg">Siguiente: {following.exercise_name}</Link>}
          <Link to={`/paciente/${pid}`} className={`btn ${following ? "btn-ghost" : "btn-primary"} btn-lg`}>Ver mi recuperación</Link>
          <Link to={`/paciente/${pid}/progreso`} className="link-arrow">Ver mi progreso <Icon name="arrow" size={16} /></Link>
        </div>
      </section>
      {session.analysis && <SessionCoach pid={pid} plan={plan} session={session} />}
    </>
  );
}
