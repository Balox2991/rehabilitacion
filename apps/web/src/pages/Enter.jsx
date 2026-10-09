import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAsync } from "../lib/useAsync.js";
import { ErrorState, Loading } from "../components/PageState.jsx";

// Selección de usuario del MODO DEMOSTRACIÓN (temporal). No es autenticación: se retira cuando existan las cuentas reales.
export default function Enter() {
  const { data, error, loading, reload } = useAsync(async () => {
    const therapists = await api.therapists();
    const first = therapists[0];
    return { therapists, patients: first ? await api.therapistPatients(first.id) : [] };
  }, []);

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const [therapist] = data.therapists;
  return (
    <div className="container page-pad">
      <p className="eyebrow">Modo demostración · temporal</p>
      <h1 className="page-title">¿Cómo quieres entrar?</h1>
      <p className="lead">
        Elige un perfil para recorrer la aplicación con datos ficticios. El inicio de sesión real con contraseña y roles se
        implementa en la Fase 5.
      </p>

      {!therapist ? (
        <div className="notice notice-info">
          No hay datos de demostración. Ejecuta <code>npm run seed</code> en <code>apps/backend</code> y recarga.
        </div>
      ) : (
        <div className="enter-grid">
          <section className="card card-pad enter-card">
            <h2>Soy fisioterapeuta</h2>
            <p>Panel con el estado de todos tus pacientes, alertas y estadísticas.</p>
            <Link to={`/fisio/${therapist.id}`} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
              Entrar como {therapist.name}
            </Link>
          </section>

          <section className="card card-pad enter-card">
            <h2>Soy paciente</h2>
            <p>Tu plan, tus ejercicios con cámara y tu evolución.</p>
            <ul className="patient-list">
              {data.patients.map((p) => (
                <li key={p.id}>
                  <Link to={`/paciente/${p.id}`} className="patient-link">
                    <span className="avatar" aria-hidden="true">{p.name[0]}</span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.fracture_site}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
