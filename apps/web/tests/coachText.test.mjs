import { test } from "node:test";
import assert from "node:assert/strict";
import { appliedNote, coachAction, coachText } from "../src/lib/coachText.js";
import { COACH_CODES } from "../../tracking-prototype/src/coach.js";

const DATA = {
  best: 71.5, target: 90, previous: 64, sessions: 4, from: 40, to: 58, gain: 18, remaining: 8, up: 0.4, down: 0.5, expected: 3, seconds: 0.8,
  drop_pct: 22.3, first: 80, last: 62, pct: 41, usual: 70, level: 60, done: 2, streak: 3, next: 85, protect: false, of: 3, reps_per_set: 10, noise: 4, drop: 8, days: 14,
};

test("cada código del asistente tiene texto para el paciente y para el fisioterapeuta, sin huecos", () => {
  for (const code of COACH_CODES.patient) {
    const t = coachText({ code, data: DATA }, "patient", "focus");
    assert.ok(t.title && t.text.length > 15 && t.why.length > 10, `paciente/${code}`);
    assert.ok(!/undefined|NaN|\[object|null/.test(`${t.title} ${t.text} ${t.why}`), `paciente/${code}: ${t.text} | ${t.why}`);
  }
  for (const code of COACH_CODES.therapist) {
    const t = coachText({ code, data: DATA, severity: "info" }, "therapist");
    assert.ok(t.title && t.text.length > 15, `fisio/${code}`);
    assert.ok(!/undefined|NaN|\[object|null/.test(`${t.title} ${t.text}`), `fisio/${code}: ${t.text}`);
  }
});

test("el tono sale del grupo (paciente) o de la severidad (fisioterapeuta)", () => {
  assert.equal(coachText({ code: "new_best", data: DATA }, "patient", "highlights").tone, "good");
  assert.equal(coachText({ code: "slow_down", data: DATA }, "patient", "focus").tone, "info");
  assert.equal(coachText({ code: "plateau", data: DATA }, "patient", "care").tone, "warn");
  assert.equal(coachText({ code: "regression_review", severity: "warn", data: DATA }, "therapist").tone, "warn");
  assert.equal(coachText({ code: "raise_target", severity: "info", data: DATA }, "therapist").tone, "info");
});

test("el paciente no recibe jerga ni se le culpa: nada de «compensación», «ROM» ni «incumpliste»", () => {
  for (const code of COACH_CODES.patient) {
    const t = coachText({ code, data: DATA }, "patient", "care");
    assert.ok(!/compensaci|ROM\b|incumpl|mal hecho|fallaste/i.test(`${t.title} ${t.text}`), `${code}: ${t.text}`);
  }
});

test("las cifras salen con coma decimal y un decimal, y los plurales concuerdan", () => {
  assert.match(coachText({ code: "new_best", data: DATA }, "patient", "highlights").text, /71,5°/);
  assert.match(coachText({ code: "low_adherence", data: { done: 1, expected: 8 } }, "patient", "care").text, /1 sesión de unas 8/);
  assert.match(coachText({ code: "low_adherence", data: { done: 2, expected: 8 } }, "patient", "care").text, /2 sesiones de unas 8/);
  assert.match(coachText({ code: "low_adherence", severity: "warn", data: { done: 0, expected: 8, days: 14 } }, "therapist").text, /0 sesiones de unas 8/);
});

test("un tiempo ausente no deja frases rotas en «ve más despacio»", () => {
  assert.doesNotMatch(coachText({ code: "slow_down", data: { up: null, down: 0.5 } }, "patient", "focus").why, /null|undefined| y bajaste| y  /);
  assert.match(coachText({ code: "slow_down", data: { up: 0.4, down: null } }, "patient", "focus").why, /Subiste en 0,4 s:/);
});

test("la propuesta de subir la meta explica y deja la decisión al fisioterapeuta; en protección no propone", () => {
  const free = coachText({ code: "raise_target", data: { ...DATA, protect: false } }, "therapist");
  assert.match(free.label, /Meta 90° → 85°/);
  assert.match(free.text, /Las metas son individuales/);
  const protect = coachText({ code: "raise_target", data: { ...DATA, protect: true } }, "therapist");
  assert.match(protect.text, /etapa de protección/);
});

test("un código desconocido o datos ausentes no rompen la pantalla", () => {
  assert.equal(coachText({ code: "algo_nuevo", data: {} }, "patient", "focus").text, "algo_nuevo");
  assert.doesNotThrow(() => coachText(undefined, "therapist"));
  assert.doesNotThrow(() => coachText({ code: "improving" }, "patient", "highlights")); // sin data
});

test("las acciones llevan a contenido que existe en la biblioteca, y «contactar» no es un botón", () => {
  const ctx = { pid: 5, libraryCode: "knee_flexion" };
  assert.equal(coachAction({ action: { type: "library" } }, ctx).to, "/paciente/5/aprender/knee_flexion");
  assert.equal(coachAction({ action: { type: "library" } }, { pid: 5, libraryCode: null }), null);
  assert.equal(coachAction({ action: { type: "pain" } }, ctx).to, "/paciente/5/aprender/edu_pain_swelling");
  assert.equal(coachAction({ action: { type: "habit" } }, ctx).to, "/paciente/5/aprender/edu_home_program");
  assert.equal(coachAction({ action: { type: "setup" } }, ctx).to, "/paciente/5/aprender/edu_home_program");
  assert.equal(coachAction({ action: { type: "contact" } }, ctx), null);
  assert.equal(coachAction({}, ctx), null);
});

test("la nota clínica deja constancia del ajuste, del motivo y cabe en el límite de 2000 caracteres", () => {
  const note = appliedNote({ code: "raise_target", data: DATA }, "Meta 90° → 85°");
  assert.match(note, /^Ajuste aplicado a sugerencia del asistente: Meta 90° → 85°\. Motivo: /);
  assert.match(note, /sesiones seguidas/);
  assert.ok(appliedNote({ code: "raise_target", data: DATA }, "x".repeat(5000)).length <= 2000);
});
