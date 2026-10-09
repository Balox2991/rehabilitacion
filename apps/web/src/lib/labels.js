// Etiquetas en español para los códigos que devuelve el backend. Funciones puras (probadas en tests/labels.test.mjs).

export const PHASES = {
  proteccion: { label: "Protección", hint: "Cuidar la lesión y evitar la rigidez" },
  movilidad: { label: "Movilidad", hint: "Recuperar el rango de movimiento" },
  fortalecimiento: { label: "Fortalecimiento", hint: "Ganar fuerza y control" },
  funcional: { label: "Funcional", hint: "Volver a las actividades diarias" },
};
export const PHASE_ORDER = Object.keys(PHASES);

export const AREAS = { rodilla: "Rodilla", tobillo: "Tobillo", codo: "Codo", muneca: "Muñeca", hombro: "Hombro", general: "General" };
export const CATEGORIES = { movilidad: "Movilidad", fortalecimiento: "Fortalecimiento", educacion: "Educación" };

export const EVIDENCE_KIND = {
  revision_sistematica: "Revisión sistemática",
  guia_clinica: "Guía clínica",
  estudio_validacion: "Estudio de validación",
  articulo_tecnico: "Artículo técnico",
};
export const EVIDENCE_TOPIC = {
  telerrehabilitacion: "Telerrehabilitación",
  fracturas: "Rehabilitación de fracturas",
  medicion: "Medición con cámara",
  adherencia: "Adherencia al ejercicio",
};

export const DIFFICULTY = ["Suave", "Moderado", "Exigente"];

export const phaseLabel = (p) => PHASES[p]?.label ?? "Sin definir";
export const areaLabel = (a) => AREAS[a] ?? a;
export const difficultyLabel = (n) => DIFFICULTY[n - 1] ?? "";

// "3 series de 10 · 5 s" para una línea de rutina.
export function dosage({ sets, reps, hold_seconds }) {
  const base = reps === 1 && hold_seconds ? `${sets} ${sets === 1 ? "serie" : "series"} de ${hold_seconds} s` : `${sets} ${sets === 1 ? "serie" : "series"} de ${reps}`;
  return reps === 1 && hold_seconds ? base : hold_seconds ? `${base} · sostener ${hold_seconds} s` : base;
}

// Enlace externo de un estudio: PubMed si tiene PMID, si no DOI, si no su URL.
export const evidenceLink = (e) => e.url;
export const evidenceId = (e) => (e.pmid ? `PMID ${e.pmid}` : e.doi ? `DOI ${e.doi}` : e.source);
