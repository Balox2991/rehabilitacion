import { Link, Outlet, useLocation } from "react-router-dom";
import Brand from "./Brand.jsx";

export default function AppShell() {
  const { pathname } = useLocation();
  const inApp = pathname.startsWith("/fisio") || pathname.startsWith("/paciente");

  return (
    <div className="shell">
      <header className="topbar">
        <div className="container topbar-in">
          <Brand to="/demo" />
          <nav className="topnav" aria-label="Principal">
            {inApp && <span className="demo-badge" title="Los datos de esta demostración son ficticios">Modo demostración</span>}
            <Link to={inApp ? "/demo" : "/"} className="btn btn-ghost btn-sm topnav-switch">{inApp ? "Cambiar de usuario" : "Volver al ingreso"}</Link>
          </nav>
        </div>
      </header>
      <main id="contenido">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-in">
          <Brand compact />
          <p>Proyecto de grado · Ingeniería de Sistemas. Demostración con datos ficticios; no es un dispositivo médico.</p>
        </div>
      </footer>
    </div>
  );
}
