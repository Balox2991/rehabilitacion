import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { formatDocument } from "../../lib/colombia.js";
import { PHASES } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Avatar from "../../components/Avatar.jsx";
import ContactActions from "../../components/ContactActions.jsx";
import Icon from "../../components/Icon.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import StatusPill from "../../components/StatusPill.jsx";
import { averageProgress } from "../../lib/patientHome.js";

// Ficha del paciente: cabecera fija con lo esencial (quién es, cómo va, cómo contactarlo) + pestañas.
// Los datos se cargan una vez aquí y las pestañas los reciben por contexto; al guardar algo, `reload()` los refresca.
export default function PatientDetail() {
  const { tid, pid } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.patientOverview(pid), [pid]);

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { patient, plans, summary } = data;
  const base = `/fisio/${tid}/paciente/${pid}`;
  const phase = patient.recovery_phase ? PHASES[patient.recovery_phase] : null;
  const tabs = [
    { to: base, label: "Resumen", end: true },
    { to: `${base}/plan`, label: "Plan y rutinas" },
    { to: `${base}/sesiones`, label: "Sesiones" },
    { to: `${base}/notas`, label: "Notas" },
    { to: `${base}/informe`, label: "Informe" },
    { to: `${base}/datos`, label: "Datos del paciente" },
  ];

  // Línea de identificación: documento · edad · ciudad · EPS (solo lo que exista).
  const identity = [
    patient.document_number && formatDocument(patient.document_type, patient.document_number),
    patient.age != null && `${patient.age} años`,
    patient.city,
    patient.eps,
  ].filter(Boolean);
  const clinical = [
    patient.diagnosis_code && `CIE-10 ${patient.diagnosis_code}`,
    patient.fracture_site,
    patient.days_since_injury != null && `Día ${patient.days_since_injury} de recuperación`,
  ].filter(Boolean);

  return (
    <div className="page-inner stack">
      <Link to={`/fisio/${tid}/pacientes`} className="back" style={{ marginBottom: -12 }}>← Volver a pacientes</Link>

      <header className="pd card">
        <Avatar patient={patient} size="xl" />
        <div className="pd-main">
          <div className="pd-title">
            <h1>{patient.name}</h1>
            <StatusPill status={summary.status} />
          </div>
          <p className="pd-line">{identity.length ? identity.join(" · ") : <span className="pd-missing">Documento y datos personales sin completar</span>}</p>
          <p className="pd-line pd-line-clinical">{clinical.length ? clinical.join(" · ") : "Sin diagnóstico registrado"}{phase && <> · <strong>Etapa: {phase.label}</strong></>}</p>
          {summary.age == null && !patient.document_number && <Link to={`${base}/datos`} className="pd-complete">Completar la ficha →</Link>}
        </div>
        <ProgressRing value={averageProgress(plans)} size={96} stroke={9} label="de la meta" />
        <div className="pd-actions">
          <Link to={`${base}/informe`} className="btn btn-primary btn-sm"><Icon name="file" size={16} /> Generar informe</Link>
          <Link to={`${base}/datos`} className="btn btn-ghost btn-sm"><Icon name="edit" size={16} /> Editar datos</Link>
          <ContactActions phone={patient.phone} name={patient.name} from={patient.therapist_name} />
        </div>
      </header>

      <nav className="tabs" aria-label="Secciones de la ficha">
        {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className="tab">{t.label}</NavLink>)}
      </nav>

      <Outlet context={{ data, reload, tid, pid }} />
    </div>
  );
}
