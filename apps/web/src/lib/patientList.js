// Filtros y orden de la lista de pacientes. Puros y probados. El estado (filtro, orden, búsqueda) vive en la URL:
// así se puede compartir un enlace, el botón «atrás» funciona y al volver de una ficha la lista queda como estaba.

import { STATUS, needsAttention } from "./format.js";

export const FILTERS = [
  { id: "todos", label: "Todos", test: () => true },
  { id: "atencion", label: "Requieren atención", test: (p) => needsAttention(p.status) },
  { id: "al_dia", label: "Al día", test: (p) => p.status === "al_dia" },
  { id: "en_meta", label: "Meta alcanzada", test: (p) => p.status === "en_meta" },
  { id: "sin_plan", label: "Sin plan", test: (p) => p.status === "sin_plan" },
];

const byName = (a, b) => a.name.localeCompare(b.name, "es");
const nullsLast = (get, dir = 1) => (a, b) => {
  const x = get(a);
  const y = get(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return (x - y) * dir;
};

export const SORTS = [
  { id: "prioridad", label: "Quién me necesita primero", cmp: (a, b) => STATUS[a.status].rank - STATUS[b.status].rank || byName(a, b) },
  { id: "nombre", label: "Nombre (A–Z)", cmp: byName },
  { id: "progreso", label: "Menor progreso primero", cmp: (a, b) => nullsLast((p) => p.progress_pct)(a, b) || byName(a, b) },
  { id: "reciente", label: "Última sesión más reciente", cmp: (a, b) => nullsLast((p) => p.days_since_last_session)(a, b) || byName(a, b) },
];

// Quita tildes y pasa a minúsculas para que «angela» encuentre «Ángela».
const normalize = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function applyView(patients, { estado = "todos", orden = "prioridad", q = "" } = {}) {
  const filter = FILTERS.find((f) => f.id === estado) ?? FILTERS[0];
  const sort = SORTS.find((s) => s.id === orden) ?? SORTS[0];
  const needle = normalize(q.trim());
  return patients
    .filter(filter.test)
    .filter((p) => !needle || normalize(`${p.name} ${p.fracture_site ?? ""} ${p.diagnosis_code ?? ""} ${p.city ?? ""}`).includes(needle))
    .sort(sort.cmp); // filter() ya devolvió un arreglo nuevo: no se modifica la lista original
}

export const initials = (name) =>
  name
    .replace(/^(dra?\.)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// Seis tonos suaves y estables por paciente: la lista se lee mejor con avatares distintos sin llenarse de color.
export const AVATAR_TONES = 6;
export const avatarTone = (id) => Math.abs(Number(id) || 0) % AVATAR_TONES;
