import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { deg, sideLabel } from "../../lib/format.js";
import { angleFromFlexion, flexionFromAngle } from "../../lib/rom.js";
import { PHASES, PHASE_ORDER, areaLabel, phaseLabel } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Icon from "../../components/Icon.jsx";

// Confirmación en dos pasos, sin diálogos del navegador.
function ConfirmButton({ label, confirmLabel = "Sí, confirmar", onConfirm, disabled }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setAsking(true)} disabled={disabled}><Icon name="trash" size={15} /> {label}</button>;
  return (
    <span className="confirm">
      <button type="button" className="btn btn-danger btn-sm" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>No</button>
    </span>
  );
}

const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || min)));

function PlanRow({ plan, exercise, onChanged, onError }) {
  const [flex, setFlex] = useState(Math.round(plan.target_flexion));
  const [sets, setSets] = useState(plan.sets);
  const [reps, setReps] = useState(plan.reps_per_set);
  const [times, setTimes] = useState(plan.times_per_week);
  const [busy, setBusy] = useState(false);
  const dirty = flex !== Math.round(plan.target_flexion) || sets !== plan.sets || reps !== plan.reps_per_set || times !== plan.times_per_week;

  async function save() {
    setBusy(true);
    try {
      await api.updatePlan(plan.plan_id, { target_angle: angleFromFlexion(exercise.direction, flex), sets, reps_per_set: reps, times_per_week: times });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    setBusy(true);
    try {
      await api.updatePlan(plan.plan_id, { active: false });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card card-pad plan-edit">
      <div className="plan-top">
        <div>
          <h3>{plan.exercise_name}</h3>
          <p className="card-sub">{sideLabel(plan.side)} · flexión actual {deg(plan.latest_flexion)} · {plan.progress_pct ?? 0}% de la meta</p>
        </div>
      </div>
      <div className="form-grid form-grid-4">
        <label>Meta (° de flexión)<input type="number" min="10" max="175" value={flex} onChange={(e) => setFlex(clampInt(e.target.value, 10, 175))} /></label>
        <label>Series<input type="number" min="1" max="10" value={sets} onChange={(e) => setSets(clampInt(e.target.value, 1, 10))} /></label>
        <label>Repeticiones por serie<input type="number" min="1" max="50" value={reps} onChange={(e) => setReps(clampInt(e.target.value, 1, 50))} /></label>
        <label>Veces por semana<input type="number" min="1" max="21" value={times} onChange={(e) => setTimes(clampInt(e.target.value, 1, 21))} /></label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        <ConfirmButton label="Desactivar" confirmLabel="Sí, desactivar" onConfirm={deactivate} disabled={busy} />
      </div>
    </article>
  );
}

// Primera combinación ejercicio + lado que el paciente todavía no tiene activa (para no abrir el formulario ya en conflicto).
function firstFree(exercises, plans) {
  for (const e of exercises) for (const side of ["right", "left"]) {
    if (!plans.some((p) => p.exercise_code === e.code && p.side === side)) return { code: e.code, side };
  }
  return { code: exercises[0]?.code ?? "", side: "right" };
}

function AddPlan({ exercises, plans, patientId, therapistId, onChanged, onError }) {
  const start = firstFree(exercises, plans);
  const [code, setCode] = useState(start.code);
  const [side, setSide] = useState(start.side);
  const ex = exercises.find((e) => e.code === code);
  const [flex, setFlex] = useState(ex ? Math.round(flexionFromAngle(ex.direction, ex.default_target_angle)) : 90);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [times, setTimes] = useState(3);
  const [busy, setBusy] = useState(false);
  const taken = plans.some((p) => p.exercise_code === code && p.side === side);

  const pick = (c) => {
    setCode(c);
    const e = exercises.find((x) => x.code === c);
    setFlex(Math.round(flexionFromAngle(e.direction, e.default_target_angle)));
  };

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createPlan(patientId, { exercise_code: code, side, target_angle: angleFromFlexion(ex.direction, flex), sets, reps_per_set: reps, times_per_week: times, created_by: Number(therapistId) });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad form-card" onSubmit={add}>
      <h3 className="card-title">Prescribir un ejercicio con cámara</h3>
      <p className="card-sub">Estos son los ejercicios que la app puede medir. Los demás viven en las rutinas.</p>
      <div className="form-grid form-grid-3">
        <label>Ejercicio
          <select value={code} onChange={(e) => pick(e.target.value)}>{exercises.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
        </label>
        <label>Lado
          <select value={side} onChange={(e) => setSide(e.target.value)}><option value="left">Izquierdo</option><option value="right">Derecho</option></select>
        </label>
        <label>Meta (° de flexión)<input type="number" min="10" max="175" value={flex} onChange={(e) => setFlex(clampInt(e.target.value, 10, 175))} /></label>
        <label>Veces por semana<input type="number" min="1" max="21" value={times} onChange={(e) => setTimes(clampInt(e.target.value, 1, 21))} /></label>
        <label>Series<input type="number" min="1" max="10" value={sets} onChange={(e) => setSets(clampInt(e.target.value, 1, 10))} /></label>
        <label>Repeticiones por serie<input type="number" min="1" max="50" value={reps} onChange={(e) => setReps(clampInt(e.target.value, 1, 50))} /></label>
      </div>
      {taken && <p className="card-sub" style={{ color: "var(--warn)" }}>Este paciente ya tiene ese ejercicio activo en ese lado; ajústalo arriba o desactívalo primero.</p>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || taken}><Icon name="plus" size={18} /> {busy ? "Agregando…" : "Agregar al plan"}</button>
      </div>
    </form>
  );
}

export default function PlanTab() {
  const { data, reload, tid, pid } = useOutletContext();
  const { data: refs, error, loading, reload: reloadRefs } = useAsync(async () => {
    const [exercises, routines] = await Promise.all([api.exercises(), api.routines()]);
    return { exercises, routines };
  }, []);
  const [problem, setProblem] = useState("");
  const [routineCode, setRoutineCode] = useState("");

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reloadRefs} />;

  const { patient, plans, routines } = data;
  const changed = () => { setProblem(""); reload(); };
  const available = refs.routines.filter((r) => !routines.assigned.some((a) => a.code === r.code));

  async function assign() {
    if (!routineCode) return;
    try { await api.assignRoutine(pid, routineCode, Number(tid)); setRoutineCode(""); changed(); } catch (err) { setProblem(err.message); }
  }
  async function unassign(id) {
    try { await api.unassignRoutine(pid, id); changed(); } catch (err) { setProblem(err.message); }
  }
  async function setPhase(e) {
    try { await api.updatePatient(pid, { recovery_phase: e.target.value || null }); changed(); } catch (err) { setProblem(err.message); }
  }

  return (
    <div className="tab-body">
      {problem && <p className="notice notice-error" role="alert">{problem}</p>}

      <section aria-labelledby="h-etapa">
        <h2 className="section-h" id="h-etapa">Etapa de recuperación</h2>
        <div className="card card-pad phase-card">
          <label className="phase-select">Etapa actual
            <select value={patient.recovery_phase ?? ""} onChange={setPhase}>
              <option value="">Sin definir</option>
              {PHASE_ORDER.map((k) => <option key={k} value={k}>{PHASES[k].label} — {PHASES[k].hint}</option>)}
            </select>
          </label>
          <p className="card-sub">Define qué rutinas se sugieren al paciente: nunca le ofrecemos una etapa más exigente que la tuya.</p>
        </div>
      </section>

      <section aria-labelledby="h-plan">
        <h2 className="section-h" id="h-plan">Ejercicios con cámara prescritos</h2>
        <div className="plan-list">
          {plans.length === 0 && <div className="notice notice-info">Este paciente aún no tiene ejercicios con cámara.</div>}
          {plans.map((p) => (
            <PlanRow key={`${p.plan_id}-${p.target_angle}-${p.sets}-${p.reps_per_set}-${p.times_per_week}`} plan={p} exercise={refs.exercises.find((e) => e.code === p.exercise_code)} onChanged={changed} onError={setProblem} />
          ))}
          <AddPlan exercises={refs.exercises} plans={plans} patientId={pid} therapistId={tid} onChanged={changed} onError={setProblem} />
        </div>
      </section>

      <section aria-labelledby="h-rut">
        <h2 className="section-h" id="h-rut">Rutinas asignadas</h2>
        <div className="card card-pad">
          {routines.assigned.length === 0 ? <p className="card-sub">Sin rutinas asignadas.</p> : (
            <ul className="assigned-list">
              {routines.assigned.map((r) => (
                <li key={r.assignment_id}>
                  <div>
                    <strong>{r.title}</strong>
                    <small>{areaLabel(r.body_area)} · {phaseLabel(r.phase)} · {r.item_count} ejercicios · {r.duration_min} min</small>
                  </div>
                  <ConfirmButton label="Quitar" confirmLabel="Sí, quitar" onConfirm={() => unassign(r.assignment_id)} />
                </li>
              ))}
            </ul>
          )}
          <div className="assign-row">
            <label>Asignar una rutina
              <select value={routineCode} onChange={(e) => setRoutineCode(e.target.value)}>
                <option value="">Elige una rutina…</option>
                {available.map((r) => <option key={r.code} value={r.code}>{r.title} ({phaseLabel(r.phase)})</option>)}
              </select>
            </label>
            <button className="btn btn-primary btn-sm" onClick={assign} disabled={!routineCode}>Asignar</button>
          </div>
          {routines.recommended.length > 0 && (
            <p className="card-sub" style={{ marginTop: 12 }}>
              Sugeridas por su etapa y sus ejercicios: {routines.recommended.map((r) => r.title).join(", ")}.
            </p>
          )}
          <p className="card-sub" style={{ marginTop: 8 }}>Puedes revisar el contenido de cada rutina en la <Link to={`/fisio/${tid}/biblioteca`}>biblioteca</Link>.</p>
        </div>
      </section>
    </div>
  );
}
