import { useState } from "react";
import { Link } from "react-router-dom";
import { normalizeEmail, validateLogin } from "../lib/loginForm.js";
import Icon from "../components/Icon.jsx";

const POINTS = [
  { icon: "camera", text: "Mide tus movimientos con la cámara de tu casa" },
  { icon: "shield", text: "Tu video nunca sale de tu dispositivo" },
  { icon: "chart", text: "Tu fisioterapeuta sigue tu evolución" },
];

// Pantalla de ingreso: foto a la izquierda (desvanecida hacia el fondo) y la tarjeta de acceso flotando a la derecha.
export default function Login() {
  const [values, setValues] = useState({ email: "", password: "" });
  const [touched, setTouched] = useState({});
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState("");

  const errors = validateLogin(values);
  const showError = (field) => touched[field] && errors[field];

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setNotice("");
  };

  function submit(e) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (Object.keys(errors).length) return;
    setValues((v) => ({ ...v, email: normalizeEmail(v.email) }));
    // El inicio de sesión con cuentas reales llega con la autenticación (siguiente etapa del proyecto).
    setNotice("El inicio de sesión con cuentas reales se activa en la siguiente etapa. Mientras tanto puedes recorrer la aplicación en modo demostración.");
  }

  return (
    <div className="auth">
      <section className="auth-photo" aria-label="Presentación">
        <div className="auth-photo-img" aria-hidden="true" />
        <div className="auth-photo-mark" aria-hidden="true" />
        <div className="auth-photo-copy">
          <p className="auth-kicker">Programa de rehabilitación domiciliaria</p>
          <h1>Tu recuperación en casa, acompañada de inteligencia artificial</h1>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p.text}><span aria-hidden="true"><Icon name={p.icon} size={18} /></span>{p.text}</li>
            ))}
          </ul>
        </div>
      </section>

      <main className="auth-side" id="contenido">
        <div className="auth-card">
          <img className="auth-logo" src="/brand/logo-completo.png" alt="Clínica Ocaña · App rehabilitación física" width="180" height="162" />
          <div className="auth-head">
            <h2>Te damos la bienvenida</h2>
            <p>Ingresa con tu cuenta para continuar con tu rehabilitación.</p>
          </div>

          <form onSubmit={submit} noValidate className="auth-form">
            <div className={`auth-field ${showError("email") ? "has-error" : ""}`}>
              <label htmlFor="login-email">Correo electrónico</label>
              <input
                id="login-email" type="email" autoComplete="username" inputMode="email" placeholder="nombre@correo.com"
                value={values.email} onChange={set("email")} onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={showError("email") ? "true" : undefined} aria-describedby={showError("email") ? "login-email-err" : undefined}
              />
              {showError("email") && <p className="auth-error" id="login-email-err">{errors.email}</p>}
            </div>

            <div className={`auth-field ${showError("password") ? "has-error" : ""}`}>
              <label htmlFor="login-password">Contraseña</label>
              <div className="auth-password">
                <input
                  id="login-password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Tu contraseña"
                  value={values.password} onChange={set("password")} onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  aria-invalid={showError("password") ? "true" : undefined} aria-describedby={showError("password") ? "login-password-err" : undefined}
                />
                <button type="button" className="auth-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}>
                  <Icon name={show ? "eyeoff" : "eye"} size={20} />
                </button>
              </div>
              {showError("password") && <p className="auth-error" id="login-password-err">{errors.password}</p>}
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block auth-submit">Ingresar</button>
            {notice && <p className="notice notice-info" role="status">{notice}</p>}
          </form>

          <p className="auth-help">¿Aún no tienes cuenta? Tu fisioterapeuta te registra y te envía una invitación por correo.</p>
          <p className="auth-demo">
            <Link to="/demo">Entrar en modo demostración</Link>
            <small>Temporal, con datos ficticios, hasta activar las cuentas reales.</small>
          </p>
        </div>
        <p className="auth-foot">Proyecto de grado · Ingeniería de Sistemas. No es un dispositivo médico.</p>
      </main>
    </div>
  );
}
