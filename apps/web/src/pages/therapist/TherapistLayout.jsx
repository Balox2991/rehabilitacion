import { NavLink, Outlet, useParams } from "react-router-dom";
import Icon from "../../components/Icon.jsx";

// Panel del fisioterapeuta: menú lateral con las cuatro áreas de trabajo.
export default function TherapistLayout() {
  const { tid } = useParams();
  const base = `/fisio/${tid}`;
  const items = [
    { to: base, label: "Resumen", icon: "grid", end: true },
    { to: `${base}/pacientes`, label: "Pacientes", icon: "users" },
    { to: `${base}/biblioteca`, label: "Biblioteca", icon: "book" },
    { to: `${base}/evidencia`, label: "Evidencia clínica", icon: "flask" },
    { to: `${base}/configuracion`, label: "Configuración", icon: "gear" },
  ];
  return (
    <div className="workspace container">
      <aside className="sidebar" aria-label="Secciones del panel">
        <nav>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="side-link">
              <Icon name={i.icon} size={20} />
              <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="side-note">Modo demostración con datos ficticios.</p>
      </aside>
      <div className="workspace-main">
        <Outlet />
      </div>
    </div>
  );
}
