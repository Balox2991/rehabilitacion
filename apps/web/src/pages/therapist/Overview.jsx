import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { alertReason, greeting, needsAction, shortName, statusHeadline, suggestedAction } from "../../lib/format.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Avatar from "../../components/Avatar.jsx";
import ContactActions from "../../components/ContactActions.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";
import Kpi from "../../components/Kpi.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatusPill from "../../components/StatusPill.jsx";
import WeeklyBars from "../../charts/WeeklyBars.jsx";
import HBars from "../../charts/HBars.jsx";

const todayText = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

// Una tarea pendiente: quién, por qué, qué hacer y los botones para hacerlo, todo visible.
function TaskItem({ p, tid, from }) {
  return (
    <li className="task">
      <div className="task-who">
        <Avatar patient={p} size="md" />
        <div className="task-text">
          <Link to={`/fisio/${tid}/paciente/${p.id}`} className="task-name">{p.name}</Link>
          <span className="task-reason">{alertReason(p) || statusHeadline(p.status)}</span>
          <span className="task-action"><Icon name="arrow" size={13} /> {suggestedAction(p.status)}</span>
        </div>
      </div>
      <StatusPill status={p.status} />
      <div className="task-buttons">
        <Link to={`/fisio/${tid}/paciente/${p.id}`} className="btn btn-primary btn-sm" aria-label={`Ver paciente ${p.name}`}>Ver paciente</Link>
        <ContactActions phone={p.phone} name={p.name} from={from} compact />
      </div>
    </li>
  );
}

export default function Overview() {
  const { tid } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.therapistSummary(tid), [tid]);
  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { kpis, patients, weekly_sessions: weekly, compensation_breakdown: breakdown, therapist } = data;
  const tasks = patients.filter((p) => needsAction(p.status));
  const onTrack = patients.filter((p) => p.status === "al_dia" || p.status === "en_meta").length;

  return (
    <div className="page-inner stack">
      <PageHeader
        title={`${greeting()}, ${shortName(therapist.name)}`}
        description={`${todayText[0].toUpperCase()}${todayText.slice(1)}`}
        actions={
          <>
            <Link to={`/fisio/${tid}/pacientes`} className="btn btn-ghost">Ver pacientes</Link>
            <Link to={`/fisio/${tid}/pacientes?nuevo=1`} className="btn btn-primary"><Icon name="plus" size={18} /> Nuevo paciente</Link>
          </>
        }
      />

      <section className="kpi-grid" aria-label="Indicadores">
        <Kpi label="Pacientes activos" value={kpis.patients} hint={`${onTrack} al día · ${kpis.needing_attention} con alerta`} />
        <Kpi label="Adherencia semanal" value={kpis.adherence_pct} unit="%" hint="Sesiones hechas frente a las del plan" />
        <Kpi label="Progreso promedio" value={kpis.avg_progress_pct} unit="%" hint="Hacia la meta de flexión de cada plan" />
        <Kpi label="Alertas de postura" value={kpis.compensation_rate_30d} unit="%" hint="De las repeticiones, últimos 30 días" />
      </section>

      <section className="card panel" aria-labelledby="h-tareas">
        <div className="panel-head">
          <div>
            <h2 id="h-tareas">Pendientes de hoy</h2>
            <p>{tasks.length === 0 ? "Todo al día" : `${tasks.length} ${tasks.length === 1 ? "paciente" : "pacientes"} para revisar, el más urgente primero`}</p>
          </div>
        </div>
        {tasks.length === 0 ? (
          <EmptyState icon="check" title="No hay pendientes">Todos tus pacientes van según lo planeado.</EmptyState>
        ) : (
          <ul className="task-list">
            {tasks.map((p) => <TaskItem key={p.id} p={p} tid={tid} from={therapist.name} />)}
          </ul>
        )}
      </section>

      <div className="two-col">
        <section className="card panel" aria-labelledby="h-semanal">
          <div className="panel-head"><div><h2 id="h-semanal">Sesiones por semana</h2><p>Todos tus pacientes, últimas 8 semanas</p></div></div>
          <WeeklyBars weeks={weekly} height={260} />
        </section>
        <section className="card panel" aria-labelledby="h-comp">
          <div className="panel-head"><div><h2 id="h-comp">Alertas de postura más frecuentes</h2><p>Repeticiones con alerta, últimos 30 días</p></div></div>
          <HBars items={breakdown} emptyText="Sin alertas de postura en 30 días." tone="brand" />
        </section>
      </div>
    </div>
  );
}
