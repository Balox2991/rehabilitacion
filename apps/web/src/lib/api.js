// Cliente de la API del backend (Fase 2). En desarrollo, Vite reenvía /api → http://localhost:3001.
const BASE = "/api";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Verifica que el backend esté corriendo (npm start en apps/backend).", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Error ${res.status}`, res.status);
  return data;
}

// Minutos al este de UTC (Colombia: -300). El servidor cuenta los "días" en la zona del usuario.
const qs = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return q ? `?${q}` : "";
};

const tz = () => -new Date().getTimezoneOffset();

// URL de la foto de un paciente (con la versión, para saltarse la caché cuando cambia).
export const photoUrl = (p) => `${BASE}/patients/${p.id}/photo?v=${encodeURIComponent(p.photo_v ?? "")}`;

export const api = {
  therapists: () => request("/therapists"),
  therapistPatients: (id) => request(`/therapists/${id}/patients`),
  therapistSummary: (id) => request(`/therapists/${id}/summary?tz=${tz()}`),
  patientOverview: (id) => request(`/patients/${id}/overview?tz=${tz()}`),
  saveSession: (patientId, body) => request(`/patients/${patientId}/sessions`, { method: "POST", body }),

  // Biblioteca, rutinas y evidencia
  library: (params = {}) => request(`/library${qs(params)}`),
  libraryItem: (code) => request(`/library/${code}`),
  setVideo: (code, video_url) => request(`/library/${code}`, { method: "PATCH", body: { video_url } }),
  routines: (params = {}) => request(`/routines${qs(params)}`),
  routine: (code) => request(`/routines/${code}`),
  evidence: () => request("/evidence"),

  // Gestión clínica
  exercises: () => request("/exercises"),
  createPatient: (body) => request("/users", { method: "POST", body: { role: "patient", ...body } }),
  updatePatient: (id, body) => request(`/patients/${id}`, { method: "PATCH", body }),
  patient: (id) => request(`/patients/${id}`),
  createPlan: (patientId, body) => request(`/patients/${patientId}/plans`, { method: "POST", body }),
  updatePlan: (planId, body) => request(`/plans/${planId}`, { method: "PATCH", body }),
  assignRoutine: (patientId, routine_code, assigned_by) => request(`/patients/${patientId}/routines`, { method: "POST", body: { routine_code, assigned_by } }),
  unassignRoutine: (patientId, assignmentId) => request(`/patients/${patientId}/routines/${assignmentId}`, { method: "DELETE" }),
  notes: (patientId) => request(`/patients/${patientId}/notes`),
  addNote: (patientId, author_id, body) => request(`/patients/${patientId}/notes`, { method: "POST", body: { author_id, body } }),
  sessions: (patientId) => request(`/patients/${patientId}/sessions`),
  session: (id) => request(`/sessions/${id}`),
  coach: (patientId, params = {}) => request(`/patients/${patientId}/coach${qs(params)}`),
  sessionTrace: (id) => request(`/sessions/${id}/trace`),
  reanalyzeSession: (id) => request(`/sessions/${id}/analysis`, { method: "POST" }),
  setConsent: (patientId, granted, recorded_by) => request(`/patients/${patientId}/consent`, { method: "PUT", body: { granted, recorded_by } }),
  uploadPhoto: async (patientId, jpegBlob) => {
    let res;
    try {
      res = await fetch(`${BASE}/patients/${patientId}/photo`, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: jpegBlob });
    } catch {
      throw new ApiError("No se pudo conectar con el servidor.", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? `Error ${res.status}`, res.status);
    return data;
  },
  deletePhoto: (patientId) => request(`/patients/${patientId}/photo`, { method: "DELETE" }),
  settings: (therapistId) => request(`/therapists/${therapistId}/settings`),
  saveSettings: (therapistId, body) => request(`/therapists/${therapistId}/settings`, { method: "PUT", body }),
  report: (patientId) => request(`/patients/${patientId}/report?tz=${tz()}`),
};
