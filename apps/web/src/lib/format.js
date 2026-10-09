// Funciones puras de presentación (probadas en tests/format.test.mjs).

export const STATUS = {
  sin_actividad: { label: "Sin actividad", tone: "risk", rank: 0 },
  compensaciones: { label: "Compensaciones", tone: "warn", rank: 1 },
  al_dia: { label: "Al día", tone: "ok", rank: 2 },
  en_meta: { label: "Meta alcanzada", tone: "info", rank: 3 },
  sin_plan: { label: "Sin plan", tone: "mute", rank: 4 },
};

export const needsAttention = (status) => status === "sin_actividad" || status === "compensaciones";

export function relativeDays(days) {
  if (days == null) return "Sin sesiones";
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export const sideLabel = (side) => (side === "left" ? "lado izquierdo" : "lado derecho");

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// "Dra. Camila Restrepo" → "Dra. Camila"; "Andrés Mejía" → "Andrés"
export function shortName(full) {
  const parts = full.trim().split(/\s+/);
  return /^(dra?\.)$/i.test(parts[0]) && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0];
}

const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
export const formatDay = (iso) => dateFmt.format(new Date(iso)).replace(".", "");

const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
export const formatTime = (iso) => timeFmt.format(new Date(iso));

// Texto de la alerta de un paciente en el dashboard.
export function alertReason(p) {
  if (p.status === "sin_actividad") {
    return p.days_since_last_session == null
      ? "Aún no ha hecho ninguna sesión"
      : `${p.days_since_last_session} días sin hacer sus ejercicios`;
  }
  if (p.status === "compensaciones") return `${Math.round(p.compensation_rate_30d)} % de sus repeticiones con compensación`;
  return "";
}

// Grados de movimiento → texto ("85°"). null-safe.
export const deg = (v) => (v == null ? "—" : `${Math.round(v)}°`);
export const pctText = (v) => (v == null ? "—" : `${v}%`);

// Acción sugerida al fisioterapeuta para cada estado (son sugerencias operativas, no decisiones clínicas).
export const suggestedAction = (status) =>
  ({
    sin_actividad: "Llamar para explorar barreras (dolor, tiempo, dudas con la app)",
    compensaciones: "Revisar la técnica; valorar una cita presencial",
    en_meta: "Evaluar el alta o pasar a la siguiente etapa",
    sin_plan: "Prescribir un plan de ejercicios",
  })[status] ?? "";

// Estados que generan una tarea pendiente para el fisioterapeuta.
export const needsAction = (status) => ["sin_actividad", "compensaciones", "en_meta", "sin_plan"].includes(status);

// Frase corta que resume el estado de un paciente en la ficha.
export const statusHeadline = (status) =>
  ({
    al_dia: "Va según lo planeado",
    sin_actividad: "Lleva varios días sin hacer sus ejercicios",
    compensaciones: "Compensa con frecuencia al hacer el movimiento",
    en_meta: "Alcanzó su meta de movimiento",
    sin_plan: "Aún no tiene ejercicios asignados",
  })[status] ?? "";
