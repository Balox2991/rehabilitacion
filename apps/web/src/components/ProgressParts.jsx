import { useState } from "react";
import { Link } from "react-router-dom";
import { deg, formatDay, formatTime, sideLabel } from "../lib/format.js";
import { weekTotals } from "../lib/patientHome.js";
import Kpi from "./Kpi.jsx";
import RomChart from "../charts/RomChart.jsx";
import WeekStrip from "../charts/WeekStrip.jsx";
import StickDemo from "../demos/StickDemo.jsx";
import { hasDemo } from "../demos/demos.js";

// Piezas de "progreso" compartidas: las usan la pantalla de inicio del paciente y la ficha del fisioterapeuta.
// Todas reciben la respuesta de GET /patients/:id/overview; ninguna calcula estadísticas por su cuenta.

function WeeklyDots({ done, total }) {
  return (
    <span className="dots" role="img" aria-label={`${done} de ${total} sesiones esta semana`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? "is-on" : ""} />)}
    </span>
  );
}

export function StatsRow({ data }) {
  const { done: weekDone, planned: weekPlanned } = weekTotals(data.plans);
  return (
    <section className="kpi-grid" aria-label="Resumen">
      <Kpi label="Racha" value={data.streak_days} unit={data.streak_days === 1 ? " día" : " días"} hint="Días seguidos con sesión" />
      <Kpi label="Esta semana" value={weekPlanned ? `${weekDone}/${weekPlanned}` : null} hint="Sesiones hechas frente a las del plan" />
      <Kpi label="Sesiones" value={data.totals.sessions} hint="Desde que empezó" />
      <Kpi label="Repeticiones" value={data.totals.reps} hint="Movimientos completados" />
    </section>
  );
}

export function PlanCards({ data, startTo }) {
  const { plans } = data;
  if (!plans.length) return <div className="notice notice-info">Aún no hay un plan de ejercicios asignado.</div>;
  return (
    <div className="plan-list">
      {plans.map((p) => (
        <article key={p.plan_id} className="card card-pad plan">
          <div className="plan-top">
            <div className="plan-title">
              {hasDemo(p.exercise_code) && <div className="plan-thumb"><StickDemo demo={p.exercise_code} target={p.target_angle} compact /></div>}
              <div>
                <h3>{p.exercise_name}</h3>
                <p className="card-sub">{sideLabel(p.side)} · {p.sets} series de {p.reps_per_set} · meta {deg(p.target_flexion)}</p>
              </div>
            </div>
            <span className={`pill ${p.done_7d >= p.times_per_week ? "pill-ok" : "pill-info"}`}>
              {p.done_7d >= p.times_per_week ? "Semana completa" : `${p.done_7d} de ${p.times_per_week} esta semana`}
            </span>
          </div>
          <div className="plan-body">
            <div className="plan-metric">
              <span>Flexión actual</span>
              <strong className="num">{deg(p.latest_flexion)}</strong>
            </div>
            <div className="plan-metric plan-metric-grow">
              <span>Progreso hacia la meta</span>
              <div className="cell-meter">
                <div className="meter"><span style={{ width: `${p.progress_pct ?? 0}%` }} /></div>
                <strong className="num">{p.progress_pct == null ? "—" : `${p.progress_pct}%`}</strong>
              </div>
            </div>
            <div className="plan-metric">
              <span>Sesiones</span>
              <WeeklyDots done={p.done_7d} total={p.times_per_week} />
            </div>
          </div>
          {startTo && <Link to={startTo(p)} className="btn btn-primary plan-cta">Empezar ejercicio</Link>}
        </article>
      ))}
    </div>
  );
}

export function EvolutionCard({ plans }) {
  const [active, setActive] = useState(0);
  if (!plans.length) return null;
  const plan = plans[Math.min(active, plans.length - 1)];
  return (
    <section className="card card-pad" aria-labelledby="h-evo">
      <div className="table-head">
        <div>
          <h2 className="card-title" id="h-evo">Evolución del movimiento</h2>
          <p className="card-sub">Mejor repetición de cada sesión, en grados de flexión</p>
        </div>
        {plans.length > 1 && (
          <div className="chips" role="tablist" aria-label="Ejercicio">
            {plans.map((p, i) => (
              <button key={p.plan_id} role="tab" aria-selected={i === active} className={`chip ${i === active ? "is-on" : ""}`} onClick={() => setActive(i)}>{p.exercise_name}</button>
            ))}
          </div>
        )}
      </div>
      <RomChart history={plan.history} targetFlexion={plan.target_flexion} gradientId={`rom-${plan.plan_id}`} />
    </section>
  );
}

export function WeekAndRecent({ data }) {
  const recent = data.recent_sessions;
  return (
    <>
      <section className="card card-pad" aria-labelledby="h-7d">
        <h2 className="card-title" id="h-7d">Últimos 7 días</h2>
        <WeekStrip days={data.last_7_days} />
      </section>
      <section className="card card-pad" aria-labelledby="h-rec">
        <h2 className="card-title" id="h-rec">Sesiones recientes</h2>
        {recent.length === 0 ? (
          <p className="card-sub" style={{ marginTop: 8 }}>Todavía no hay sesiones.</p>
        ) : (
          <ul className="recent">
            {recent.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.exercise_name}</strong>
                  <small>{formatDay(s.started_at)} · {formatTime(s.started_at)} · {s.reps_completed} rep.</small>
                </div>
                <div className="recent-end">
                  <span className="num">{deg(s.flexion)}</span>
                  {s.compensation_count > 0 && <span className="pill pill-warn" title="Repeticiones con alerta de postura">{s.compensation_count}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
