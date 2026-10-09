// Validaciones y normalización de datos del paciente con convenciones colombianas.
// Funciones puras (sin base de datos ni Express) para poder probarlas una por una.
//
// IMPORTANTE: son comprobaciones de FORMA para atrapar errores de digitación. No verifican que el documento,
// el teléfono o el código existan (eso requeriría consultar la Registraduría, la EPS, etc.).

export const DOCUMENT_TYPES = {
  CC: "Cédula de ciudadanía",
  TI: "Tarjeta de identidad",
  CE: "Cédula de extranjería",
  PA: "Pasaporte",
  RC: "Registro civil",
  OT: "Otro documento",
};

// Largo permitido (solo dígitos para los numéricos; alfanumérico para pasaporte y otros).
const DOCUMENT_RULES = {
  CC: { re: /^\d{5,10}$/, hint: "entre 5 y 10 dígitos" },
  TI: { re: /^\d{8,11}$/, hint: "entre 8 y 11 dígitos" },
  RC: { re: /^\d{8,11}$/, hint: "entre 8 y 11 dígitos" },
  CE: { re: /^\d{4,10}$/, hint: "entre 4 y 10 dígitos" },
  PA: { re: /^[A-Z0-9]{5,20}$/, hint: "entre 5 y 20 letras o números" },
  OT: { re: /^[A-Z0-9]{4,20}$/, hint: "entre 4 y 20 letras o números" },
};

// "1.234.567.890" → "1234567890". Devuelve null si no cumple; el mensaje de error lo arma quien llama.
export function normalizeDocument(type, raw) {
  if (!Object.hasOwn(DOCUMENT_RULES, type)) return null;
  const value = String(raw ?? "").replace(/[\s.\-]/g, "").toUpperCase();
  return DOCUMENT_RULES[type].re.test(value) ? value : null;
}
export const documentHint = (type) => DOCUMENT_RULES[type]?.hint ?? "";

// Celular colombiano: 10 dígitos que empiezan por 3 (3XX XXX XXXX). Fijo: 60 + 8 dígitos (indicativo de ciudad + número).
// Acepta "+57", espacios, guiones y paréntesis; guarda solo los 10 dígitos.
export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (digits.startsWith("+57")) digits = digits.slice(3);
  else if (/^57\d{10}$/.test(digits)) digits = digits.slice(2);
  return /^3\d{9}$/.test(digits) || /^60\d{8}$/.test(digits) ? digits : null;
}

// CIE-10: una letra (no U), dos dígitos y opcionalmente punto + 1 o 2 caracteres. Ej.: S82.2, S72.41, M54.
export function normalizeCie10(raw) {
  const value = String(raw ?? "").trim().toUpperCase();
  return /^[A-TV-Z]\d{2}(\.\d{1,2})?$/.test(value) ? value : null;
}

// Fecha calendario real (YYYY-MM-DD). new Date("2026-02-31") se "corrige" sola, por eso se compara de vuelta.
export function isCalendarDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

// Edad en años cumplidos a la fecha `now` (UTC). null si la fecha no es válida.
export function ageOn(birthDate, now) {
  if (!isCalendarDate(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

// Un JPEG empieza siempre por FF D8 FF. Se comprueba el contenido, no solo el Content-Type que declara el cliente.
export const isJpeg = (bytes) => bytes?.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
