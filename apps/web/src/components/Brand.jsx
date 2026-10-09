import { Link } from "react-router-dom";

// Marca de la clínica: el ícono real del logo + el nombre en la tipografía de la marca.
export default function Brand({ to = "/", compact = false }) {
  return (
    <Link to={to} className="brand" aria-label="Clínica Ocaña, inicio">
      <img src="/brand/marca.png" alt="" width="40" height="37" />
      <span className="brand-text">
        <strong>Clínica Ocaña</strong>
        {!compact && <small>App rehabilitación física</small>}
      </span>
    </Link>
  );
}
