// Validación y normalización de los datos de la ficha del paciente. Recibe lo que llegó en la petición
// (`body`) y devuelve SOLO las columnas a guardar, ya limpias, o el primer error en español.
// Es una función pura: no toca la base de datos, así se prueba sin levantar nada.

import { PHASES } from "./library.js";
import { DOCUMENT_TYPES, documentHint, isCalendarDate, normalizeCie10, normalizeDocument, normalizePhone } from "./validators.js";

const SIDES = ["right", "left", "both"];

// Campo de texto libre: se recorta; vacío = borrar (NULL).
const text = (label, max) => (v) => {
  if (v == null) return { value: null };
  if (typeof v !== "string") return { error: `${label} debe ser texto` };
  const t = v.trim().replace(/\s+/g, " ");
  return t.length > max ? { error: `${label} admite máximo ${max} caracteres` } : { value: t || null };
};

const isoDay = (d) => d.toISOString().slice(0, 10);

// Cada campo: cómo se valida (y normaliza) un valor. `ctx` da acceso a la fecha actual y a los demás valores finales.
const FIELDS = {
  therapist_id: (v) => (v == null ? { value: null } : Number.isInteger(v) && v > 0 ? { value: v } : { error: "therapist_id inválido" }),
  fracture_site: text("La lesión", 120),
  eps: text("La EPS", 80),
  city: text("La ciudad", 80),
  occupation: text("La ocupación", 80),
  emergency_contact_name: text("El nombre del contacto de emergencia", 100),
  notes: text("Las notas", 1000),

  recovery_phase: (v) => (v == null ? { value: null } : PHASES.includes(v) ? { value: v } : { error: `recovery_phase debe ser una de: ${PHASES.join(", ")}` }),
  dominant_side: (v) => (v == null ? { value: null } : SIDES.includes(v) ? { value: v } : { error: "dominant_side debe ser right, left o both" }),

  phone: (v) => {
    if (v == null || v === "") return { value: null };
    const n = normalizePhone(v);
    return n ? { value: n } : { error: "El celular debe tener 10 dígitos y empezar por 3 (ej. 300 123 4567); un fijo, 60 más 8 dígitos" };
  },
  emergency_contact_phone: (v) => {
    if (v == null || v === "") return { value: null };
    const n = normalizePhone(v);
    return n ? { value: n } : { error: "El teléfono del contacto de emergencia no es válido (celular de 10 dígitos que empieza por 3)" };
  },
  diagnosis_code: (v) => {
    if (v == null || v === "") return { value: null };
    const c = normalizeCie10(v);
    return c ? { value: c } : { error: "El diagnóstico debe ser un código CIE-10 válido (ej. S82.2)" };
  },

  birth_date: (v, ctx) => {
    if (v == null || v === "") return { value: null };
    if (!isCalendarDate(v)) return { error: "birth_date debe ser una fecha YYYY-MM-DD válida" };
    if (v > isoDay(ctx.now) || v < "1900-01-01") return { error: "La fecha de nacimiento no es plausible" };
    return { value: v };
  },
  injury_date: (v, ctx) => {
    if (v == null || v === "") return { value: null };
    if (!isCalendarDate(v)) return { error: "injury_date debe ser una fecha YYYY-MM-DD válida" };
    if (v > ctx.tomorrow) return { error: "La fecha de la lesión no puede estar en el futuro" };
    return { value: v };
  },
  surgery_date: (v, ctx) => {
    if (v == null || v === "") return { value: null };
    if (!isCalendarDate(v)) return { error: "surgery_date debe ser una fecha YYYY-MM-DD válida" };
    if (v > ctx.tomorrow) return { error: "La fecha de la cirugía no puede estar en el futuro" };
    return { value: v };
  },
};

// `current`: valores actuales del paciente (para validar campos que dependen de otros: documento, fechas).
export function buildProfileUpdate(body, current = {}, now = new Date()) {
  const ctx = { now, tomorrow: isoDay(new Date(now.getTime() + 86_400_000)) };
  const set = {};

  for (const [field, validate] of Object.entries(FIELDS)) {
    if (!(field in body)) continue;
    const raw = body[field] === "" ? null : body[field];
    const r = validate(raw, ctx);
    if (r.error) return { error: r.error };
    set[field] = r.value;
  }

  // El documento se valida como PAR (tipo + número): sus reglas dependen del tipo.
  if ("document_type" in body || "document_number" in body) {
    const type = "document_type" in body ? (body.document_type === "" ? null : body.document_type) : current.document_type ?? null;
    const number = "document_number" in body ? (body.document_number === "" ? null : body.document_number) : current.document_number ?? null;
    if (type == null && number == null) {
      set.document_type = null;
      set.document_number = null;
    } else {
      if (!Object.hasOwn(DOCUMENT_TYPES, type)) return { error: `document_type debe ser una de: ${Object.keys(DOCUMENT_TYPES).join(", ")}` };
      if (number == null) return { error: "Falta el número de documento" };
      const n = normalizeDocument(type, number);
      if (!n) return { error: `Número de documento inválido para ${type}: ${documentHint(type)}` };
      set.document_type = type;
      set.document_number = n;
    }
  }

  // Coherencia entre fechas (con los valores finales, nuevos o ya guardados).
  const injury = "injury_date" in set ? set.injury_date : current.injury_date;
  const surgery = "surgery_date" in set ? set.surgery_date : current.surgery_date;
  if (injury && surgery && surgery < injury) return { error: "La cirugía no puede ser anterior a la lesión" };

  return { set };
}

export const PROFILE_COLUMNS = [...Object.keys(FIELDS), "document_type", "document_number"];
