import { test } from "node:test";
import assert from "node:assert/strict";
import { CIE10_SUGGESTIONS, formatDateCo, formatDocument, formatPhone, phoneHref, thousands, whatsappUrl } from "../src/lib/colombia.js";
import { FILTERS, SORTS, applyView, avatarTone, initials } from "../src/lib/patientList.js";

test("miles con punto y documento legible", () => {
  assert.equal(thousands("1020304050"), "1.020.304.050");
  assert.equal(thousands("79123456"), "79.123.456");
  assert.equal(thousands("123"), "123");
  assert.equal(formatDocument("CC", "1020304050"), "CC 1.020.304.050");
  assert.equal(formatDocument("PA", "AB123456"), "PA AB123456", "el pasaporte no lleva puntos");
  assert.equal(formatDocument(null, null), "—");
});

test("teléfonos: formato, enlace para llamar y WhatsApp solo con celulares", () => {
  assert.equal(formatPhone("3001234567"), "300 123 4567");
  assert.equal(formatPhone("6012345678"), "(60) 1234 5678");
  assert.equal(formatPhone(null), "—");
  assert.equal(phoneHref("3001234567"), "tel:+573001234567");
  assert.equal(phoneHref(null), null);
  assert.equal(whatsappUrl("3001234567"), "https://wa.me/573001234567");
  assert.equal(whatsappUrl("3001234567", "Hola, ¿cómo va?"), "https://wa.me/573001234567?text=Hola%2C%20%C2%BFc%C3%B3mo%20va%3F");
  assert.equal(whatsappUrl("6012345678", "hola"), null, "un fijo no tiene WhatsApp");
  assert.equal(whatsappUrl(null), null);
});

test("fechas en formato día/mes/año", () => {
  assert.equal(formatDateCo("2026-09-20"), "20/09/2026");
  assert.equal(formatDateCo("2026-09-20T23:30:00.000Z"), "20/09/2026", "se muestra en UTC, sin correrse de día por la zona");
  assert.equal(formatDateCo(null), "—");
  assert.equal(formatDateCo("no es fecha"), "—");
});

test("las sugerencias CIE-10 son códigos bien formados y sin repetir", () => {
  const codes = CIE10_SUGGESTIONS.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of codes) assert.match(c, /^[A-TV-Z]\d{2}(\.\d{1,2})?$/);
});

// ----------------------------------------------------------------- lista de pacientes

const P = (id, name, status, extra = {}) => ({ id, name, status, fracture_site: "Tibia", progress_pct: null, days_since_last_session: null, ...extra });
const list = [
  P(1, "Ángela Ruiz", "al_dia", { progress_pct: 80, days_since_last_session: 0, city: "Cali" }),
  P(2, "Beto Díaz", "sin_actividad", { progress_pct: 40, days_since_last_session: 9 }),
  P(3, "Carla Mora", "compensaciones", { progress_pct: 60, days_since_last_session: 1, diagnosis_code: "S82.2" }),
  P(4, "Daniel Paz", "sin_plan"),
  P(5, "Elena Soto", "en_meta", { progress_pct: 100, days_since_last_session: 2 }),
];

test("filtrar por estado: «requieren atención» junta sin actividad y compensaciones", () => {
  assert.deepEqual(applyView(list, { estado: "atencion" }).map((p) => p.id).sort(), [2, 3]);
  assert.deepEqual(applyView(list, { estado: "en_meta" }).map((p) => p.id), [5]);
  assert.equal(applyView(list, { estado: "invalido" }).length, 5, "un valor desconocido en la URL no rompe la lista");
});

test("orden por prioridad: quien más necesita atención primero, luego por nombre", () => {
  assert.deepEqual(applyView(list, { orden: "prioridad" }).map((p) => p.id), [2, 3, 1, 5, 4]);
});

test("orden por progreso y por última sesión dejan los datos vacíos al final", () => {
  assert.deepEqual(applyView(list, { orden: "progreso" }).map((p) => p.id), [2, 3, 1, 5, 4]);
  assert.deepEqual(applyView(list, { orden: "reciente" }).map((p) => p.id), [1, 3, 5, 2, 4]);
  assert.deepEqual(applyView(list, { orden: "nombre" }).map((p) => p.name), ["Ángela Ruiz", "Beto Díaz", "Carla Mora", "Daniel Paz", "Elena Soto"]);
});

test("la búsqueda ignora tildes y mayúsculas y mira nombre, lesión, código CIE-10 y ciudad", () => {
  assert.deepEqual(applyView(list, { q: "angela" }).map((p) => p.id), [1], "sin tilde encuentra «Ángela»");
  assert.deepEqual(applyView(list, { q: "S82.2" }).map((p) => p.id), [3]);
  assert.deepEqual(applyView(list, { q: "CALI" }).map((p) => p.id), [1]);
  assert.equal(applyView(list, { q: "zzz" }).length, 0);
  assert.equal(applyView(list, { q: "   " }).length, 5);
});

test("applyView no modifica la lista original", () => {
  const copy = list.map((p) => p.id);
  applyView(list, { orden: "nombre", estado: "atencion" });
  assert.deepEqual(list.map((p) => p.id), copy);
});

test("iniciales y tonos de avatar", () => {
  assert.equal(initials("Andrés Mejía"), "AM");
  assert.equal(initials("Dra. Camila Restrepo"), "CR");
  assert.equal(initials("  marta  "), "M");
  assert.equal(avatarTone(7), avatarTone(7));
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((i) => avatarTone(i) >= 0 && avatarTone(i) < 6));
  assert.ok(FILTERS.length && SORTS.length);
});
