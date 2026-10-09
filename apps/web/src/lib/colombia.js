// Formatos y catálogos con convenciones colombianas. Funciones puras (probadas en tests/colombia.test.mjs).
// Las reglas de validación viven en el servidor (apps/backend/src/validators.js); aquí solo se PRESENTA y se ayuda a escribir.

export const DOCUMENT_TYPES = {
  CC: "Cédula de ciudadanía",
  TI: "Tarjeta de identidad",
  CE: "Cédula de extranjería",
  PA: "Pasaporte",
  RC: "Registro civil",
  OT: "Otro documento",
};

// Códigos CIE-10 de fracturas frecuentes en el alcance de este proyecto (verificados contra el catálogo CIE-10).
// Son SUGERENCIAS para escribir más rápido: el campo acepta cualquier código CIE-10 válido.
export const CIE10_SUGGESTIONS = [
  { code: "S42.0", label: "Fractura de la clavícula" },
  { code: "S42.2", label: "Fractura del extremo superior del húmero" },
  { code: "S52.0", label: "Fractura del extremo superior del cúbito" },
  { code: "S72.4", label: "Fractura del extremo inferior del fémur" },
  { code: "S82.0", label: "Fractura de la rótula" },
  { code: "S82.2", label: "Fractura de la diáfisis de la tibia" },
];

// 1020304050 → "1.020.304.050" (los puntos como separador de miles son la costumbre colombiana).
export const thousands = (digits) => String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function formatDocument(type, number) {
  if (!type || !number) return "—";
  return /^\d+$/.test(number) ? `${type} ${thousands(number)}` : `${type} ${number}`;
}

// Celular: "300 123 4567". Fijo (60 + 8 dígitos): "(60) 1234 5678".
export function formatPhone(digits) {
  if (!digits) return "—";
  if (/^3\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (/^60\d{8}$/.test(digits)) return `(60) ${digits.slice(2, 6)} ${digits.slice(6)}`;
  return digits;
}

export const phoneHref = (digits) => (digits ? `tel:+57${digits}` : null);

// WhatsApp solo funciona con celulares (empiezan por 3). El mensaje es genérico: no lleva datos de salud.
export function whatsappUrl(digits, text) {
  if (!/^3\d{9}$/.test(digits ?? "")) return null;
  return `https://wa.me/57${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const dateCo = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
// "2026-09-20" o ISO completo → "20/09/2026" (formato día/mes/año, el habitual en Colombia).
export function formatDateCo(value) {
  if (!value) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? "—" : dateCo.format(d);
}

export const SIDE_LABEL = { right: "Derecho", left: "Izquierdo", both: "Ambidiestro" };
