import { NavLink, Outlet, useParams } from "react-router-dom";
import Icon from "../../components/Icon.jsx";

// Navegación del paciente: cuatro lugares con nombres que se entienden solos.
// En pantallas pequeñas pasa a una barra inferior, alcanzable con el pulgar.
export default function PatientLayout() {
  const { pid } = useParams();
  const base = `/paciente/${pid}`;
  const tabs = [
    { to: base, label: "Inicio", icon: "home", end: true },
    { to: `${base}/progreso`, label: "Mi progreso", icon: "chart" },
    { to: `${base}/rutinas`, label: "Rutinas", icon: "list" },
    { to: `${base}/aprender`, label: "Aprender", icon: "book" },
  ];
  return (
    <>
      <nav className="patient-nav" aria-label="Secciones">
        <div className="container patient-nav-in">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="patient-tab">
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="patient-main">
        <Outlet />
      </div>
    </>
  );
}
