import { Link } from "react-router-dom";

// Encabezado común de todas las páginas del panel: título, descripción y acciones a la derecha.
// Una sola estructura en todas las pantallas para que el ojo sepa siempre dónde mirar.
export default function PageHeader({ title, description, actions, back, children }) {
  return (
    <header className="page-header">
      {back && <Link to={back.to} className="back">← {back.label}</Link>}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
