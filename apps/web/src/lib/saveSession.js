import { api } from "./api.js";

// Guarda una sesión. Si el servidor rechaza el REGISTRO (demasiado grande o con un formato que no acepta), la sesión no se
// pierde: se vuelve a guardar sin él. Los errores de red o del servidor (0 / 5xx) sí se devuelven para que el paciente
// reintente, porque ahí no hay nada que sacrificar.
export async function saveSessionSafely(patientId, body) {
  try {
    return await api.saveSession(patientId, body);
  } catch (err) {
    if (!body.trace || err.status === 0 || err.status >= 500) throw err;
    const { trace, ...withoutTrace } = body;
    void trace;
    return api.saveSession(patientId, withoutTrace);
  }
}
