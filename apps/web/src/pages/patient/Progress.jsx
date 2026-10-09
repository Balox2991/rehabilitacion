import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { deg, formatDay, formatTime } from "../../lib/format.js";
import { averageProgress, progressMessage } from "../../lib/patientHome.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Achievements from "../../components/Achievements.jsx";
import Journey from "../../components/Journey.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import PatientPage from "../../components/PatientPage.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import { EvolutionCard, StatsRow } from "../../components/ProgressParts.jsx";
import WeekStrip from "../../charts/WeekStrip.jsx";

// Sesiones recientes en lenguaje del paciente: «postura por revisar» en vez de «compensación».
function RecentSessions({ sessions }) {
  if (sessions.length === 0) return <p className="card-sub">Todavía no hay sesiones. Cuando hagas la primera, aparecerá aquí.</p>;
  return (
    <ul className="sess-list">
      {sessions.map((s) => (
        <li key={s.id} className="sess">
          <div className="sess-main">
            <strong>{s.exercise_name}</strong>
            <small>{formatDay(s.started_at)} · {formatTime(s.started_at)} · {s.reps_completed} {s.reps_completed === 1 ? "repetición" : "repeticiones"}</small>
            {s.compensation_count > 0 && (
              <span className="pill pill-warn">{s.compensation_count} {s.compensation_count === 1 ? "repetición" : "repeticiones"} con postura por revisar</span>
            )}
          </div>
          <span className="sess-flex num" title="Mejor flexión de la sesión">{deg(s.flexion)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Progress() {
  const { pid } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.patientOverview(pid), [pid]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { plans, last_7_days: days, recent_sessions: recent } = data;
  const avg = averageProgress(plans);

  return (
    <PatientPage>
      <PageHeader title="Mi progreso" description="Cómo va tu movimiento y qué tan constante has sido. Los grados son la flexión que la cámara midió en tu mejor repetición." />

      {plans.length === 0 ? (
        <section className="card panel">
          <EmptyState icon="chart" title="Aún no hay un plan para medir">Cuando tu fisioterapeuta te asigne ejercicios, aquí verás tu recorrido hacia la meta.</EmptyState>
        </section>
      ) : (
        <section className="card panel prog-hero" aria-labelledby="h-recorrido">
          <div className="prog-ring">
            <ProgressRing value={avg} size={136} stroke={12} label="de tu meta" />
            <p>{progressMessage(avg)}</p>
          </div>
          <div className="prog-journeys">
            <h2 id="h-recorrido" className="prog-title">Tu recorrido</h2>
            {plans.map((p) => <Journey key={p.plan_id} plan={p} />)}
          </div>
        </section>
      )}

      <StatsRow data={data} />
      <Achievements data={data} />

      <div className="prog-grid">
        <div className="prog-col">
          <EvolutionCard plans={plans} />
          <section className="card panel" aria-labelledby="h-7d">
            <div className="panel-head"><h2 id="h-7d">Últimos 7 días</h2><p>Un círculo lleno es un día en el que hiciste al menos una sesión.</p></div>
            <WeekStrip days={days} />
          </section>
        </div>
        <section className="card panel" aria-labelledby="h-rec">
          <div className="panel-head"><h2 id="h-rec">Sesiones recientes</h2></div>
          <RecentSessions sessions={recent} />
        </section>
      </div>
    </PatientPage>
  );
}
