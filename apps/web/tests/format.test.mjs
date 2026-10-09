import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, alertReason, deg, greeting, needsAttention, pctText, relativeDays, shortName, sideLabel } from "../src/lib/format.js";
import { flexionFromAngle } from "../src/lib/rom.js";

test("relativeDays: hoy, ayer, hace n días y sin sesiones", () => {
  assert.equal(relativeDays(0), "Hoy");
  assert.equal(relativeDays(1), "Ayer");
  assert.equal(relativeDays(7), "Hace 7 días");
  assert.equal(relativeDays(null), "Sin sesiones");
});

test("shortName conserva el título profesional y usa solo el primer nombre del paciente", () => {
  assert.equal(shortName("Dra. Camila Restrepo"), "Dra. Camila");
  assert.equal(shortName("Dr. Luis Pérez"), "Dr. Luis");
  assert.equal(shortName("Andrés Mejía"), "Andrés");
  assert.equal(shortName("Marta"), "Marta");
});

test("greeting cambia según la hora local", () => {
  assert.equal(greeting(new Date(2026, 8, 20, 8)), "Buenos días");
  assert.equal(greeting(new Date(2026, 8, 20, 15)), "Buenas tardes");
  assert.equal(greeting(new Date(2026, 8, 20, 21)), "Buenas noches");
});

test("solo 'sin actividad' y 'compensaciones' requieren atención, y tienen prioridad en el orden", () => {
  assert.equal(needsAttention("sin_actividad"), true);
  assert.equal(needsAttention("compensaciones"), true);
  for (const s of ["al_dia", "en_meta", "sin_plan"]) assert.equal(needsAttention(s), false);
  assert.ok(STATUS.sin_actividad.rank < STATUS.compensaciones.rank && STATUS.compensaciones.rank < STATUS.al_dia.rank);
});

test("alertReason explica el motivo de cada alerta", () => {
  assert.equal(alertReason({ status: "sin_actividad", days_since_last_session: 7 }), "7 días sin hacer sus ejercicios");
  assert.equal(alertReason({ status: "sin_actividad", days_since_last_session: null }), "Aún no ha hecho ninguna sesión");
  assert.equal(alertReason({ status: "compensaciones", compensation_rate_30d: 46.2 }), "46 % de sus repeticiones con compensación");
  assert.equal(alertReason({ status: "al_dia" }), "");
});

test("formato de grados, porcentajes y lado es null-safe", () => {
  assert.equal(deg(84.6), "85°");
  assert.equal(deg(null), "—");
  assert.equal(pctText(0), "0%");
  assert.equal(pctText(null), "—");
  assert.equal(sideLabel("left"), "lado izquierdo");
  assert.equal(sideLabel("right"), "lado derecho");
});

test("flexión del cliente coincide con la convención del backend (0 en reposo)", () => {
  assert.equal(flexionFromAngle("decreasing", 175), 5);
  assert.equal(flexionFromAngle("decreasing", 90), 90);
  assert.equal(flexionFromAngle("increasing", 150), 150);
});
