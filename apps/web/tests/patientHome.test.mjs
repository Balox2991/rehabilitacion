import { test } from "node:test";
import assert from "node:assert/strict";
import { averageProgress, doneToday, homeState, journey, nextStep, progressMessage, sessionsLeft, setProgress, weekTotals } from "../src/lib/patientHome.js";

const plan = (over = {}) => ({ plan_id: 1, times_per_week: 4, done_7d: 0, target_flexion: 90, latest_flexion: null, progress_pct: null, history: [], ...over });

test("sessionsLeft nunca es negativo aunque haya hecho de más", () => {
  assert.equal(sessionsLeft(plan({ done_7d: 1 })), 3);
  assert.equal(sessionsLeft(plan({ done_7d: 6 })), 0);
});

test("nextStep elige al que más le falta en proporción, no en número absoluto", () => {
  const a = plan({ plan_id: 1, times_per_week: 7, done_7d: 4 }); // faltan 3 de 7 = 43 %
  const b = plan({ plan_id: 2, times_per_week: 3, done_7d: 1 }); // faltan 2 de 3 = 67 %
  assert.equal(nextStep([a, b]).plan_id, 2);
});

test("nextStep: con empate gana el primero del plan; sin pendientes devuelve null", () => {
  const a = plan({ plan_id: 1 });
  const b = plan({ plan_id: 2 });
  assert.equal(nextStep([a, b]).plan_id, 1);
  assert.equal(nextStep([plan({ done_7d: 4 }), plan({ plan_id: 2, done_7d: 5 })]), null);
  assert.equal(nextStep([]), null);
});

test("nextStep puede saltarse el ejercicio que acaba de terminar", () => {
  const a = plan({ plan_id: 1 });
  const b = plan({ plan_id: 2, done_7d: 3 });
  assert.equal(nextStep([a, b], 1).plan_id, 2);
  assert.equal(nextStep([a], 1), null);
});

test("un plan con 0 sesiones por semana no genera un pendiente (ni divide por cero)", () => {
  assert.equal(nextStep([plan({ times_per_week: 0 })]), null);
});

test("homeState distingue sin plan, pendiente y semana completa", () => {
  assert.equal(homeState([]), "sin_plan");
  assert.equal(homeState([plan()]), "pendiente");
  assert.equal(homeState([plan({ done_7d: 4 })]), "semana_completa");
});

test("weekTotals no cuenta lo hecho de más (evita «5/4»)", () => {
  assert.deepEqual(weekTotals([plan({ done_7d: 5 }), plan({ plan_id: 2, times_per_week: 3, done_7d: 1 })]), { done: 5, planned: 7 });
  assert.deepEqual(weekTotals([]), { done: 0, planned: 0 });
});

test("doneToday mira el último día (hoy) y tolera datos ausentes", () => {
  assert.equal(doneToday([{ sessions: 2 }, { sessions: 0 }]), false);
  assert.equal(doneToday([{ sessions: 0 }, { sessions: 1 }]), true);
  assert.equal(doneToday([]), false);
  assert.equal(doneToday(undefined), false);
});

test("journey: de la primera sesión a hoy y lo que falta a la meta", () => {
  const j = journey(plan({ history: [{ flexion: 36.6 }, { flexion: 60 }], latest_flexion: 79.1, progress_pct: 87 }));
  assert.deepEqual(j, { start: 36.6, now: 79.1, target: 90, pct: 87, remaining: 11 });
});

test("journey sin sesiones: no inventa cifras", () => {
  assert.deepEqual(journey(plan()), { start: null, now: null, target: 90, pct: null, remaining: null });
});

test("journey: pasar la meta deja 0 grados por recorrer, no un número negativo", () => {
  assert.equal(journey(plan({ latest_flexion: 95, history: [{ flexion: 30 }] })).remaining, 0);
});

test("averageProgress ignora ejercicios sin datos", () => {
  assert.equal(averageProgress([plan({ progress_pct: 80 }), plan({ progress_pct: 60 }), plan({ progress_pct: null })]), 70);
  assert.equal(averageProgress([plan()]), null);
});

test("progressMessage cubre todos los tramos y no compara con otros pacientes", () => {
  for (const pct of [null, 0, 39, 40, 74, 75, 99, 100]) assert.ok(progressMessage(pct).length > 10);
  assert.match(progressMessage(100), /meta/);
  assert.notEqual(progressMessage(39), progressMessage(40));
  assert.notEqual(progressMessage(74), progressMessage(75));
});

test("setProgress: serie y repetición actuales dentro de la sesión", () => {
  assert.deepEqual(setProgress(0, 3, 10), { set: 1, repInSet: 0, total: 30, complete: false });
  assert.deepEqual(setProgress(9, 3, 10), { set: 1, repInSet: 9, total: 30, complete: false });
  assert.deepEqual(setProgress(10, 3, 10), { set: 2, repInSet: 0, total: 30, complete: false });
  assert.deepEqual(setProgress(29, 3, 10), { set: 3, repInSet: 9, total: 30, complete: false });
  assert.deepEqual(setProgress(30, 3, 10), { set: 3, repInSet: 10, total: 30, complete: true });
  assert.equal(setProgress(45, 3, 10).complete, true); // repeticiones de más: sigue «completa», sin salirse de la serie 3
});

import { achievements, bestProgress } from "../src/lib/patientHome.js";

const withHistory = (flexions, over = {}) => plan({ rest_flexion: 5, target_flexion: 90, history: flexions.map((f) => ({ flexion: f })), ...over });

test("bestProgress usa la mejor repetición de toda la historia, no la última", () => {
  assert.equal(bestProgress(withHistory([40, 90, 60])), 100);
  assert.equal(bestProgress(withHistory([47.5])), 50); // (47.5 − 5) / 85 = 50 %
});

test("bestProgress: sin historia o con meta inválida devuelve null; pasarse de la meta se limita a 100", () => {
  assert.equal(bestProgress(withHistory([])), null);
  assert.equal(bestProgress(withHistory([50], { target_flexion: 5 })), null);
  assert.equal(bestProgress(withHistory([120])), 100);
  assert.equal(bestProgress(withHistory([2])), 0); // por debajo del reposo no es negativo
});

test("achievements: paciente nuevo no tiene ninguno y cada uno indica cuánto falta", () => {
  const list = achievements({ totals: { sessions: 0, reps: 0 }, plans: [] });
  assert.equal(list.length, 6);
  assert.ok(list.every((a) => !a.earned));
  assert.deepEqual(list.find((a) => a.id === "sessions_10"), { id: "sessions_10", icon: "calendar", title: "Constancia", text: "10 sesiones completadas", current: 0, target: 10, earned: false });
});

test("achievements: se ganan por datos acumulados y el progreso no excede la meta", () => {
  const list = achievements({ totals: { sessions: 26, reps: 255 }, plans: [withHistory([30, 80])] });
  const by = Object.fromEntries(list.map((a) => [a.id, a]));
  assert.ok(by.first_session.earned && by.sessions_10.earned && by.sessions_25.earned && by.reps_100.earned);
  assert.equal(by.sessions_25.current, 25); // 26 sesiones, pero se muestra 25 de 25
  assert.ok(by.halfway.earned); // (80 − 5) / 85 = 88 %
  assert.ok(!by.goal.earned);
  assert.equal(by.goal.current, 88);
});

test("achievements: un logro ganado no se pierde si el último día se movió menos", () => {
  const list = achievements({ totals: { sessions: 3, reps: 30 }, plans: [withHistory([90, 40, 35], { latest_flexion: 35, progress_pct: 35 })] });
  assert.ok(list.find((a) => a.id === "goal").earned);
});

import { afterSession, newAchievements } from "../src/lib/patientHome.js";

test("afterSession suma la sesión y su flexión sin modificar los datos originales", () => {
  const before = { totals: { sessions: 2, reps: 20 }, plans: [withHistory([30], { plan_id: 7 }), withHistory([10], { plan_id: 8 })] };
  const after = afterSession(before, 7, { reps_completed: 8, flexion: 60 });
  assert.deepEqual(after.totals, { sessions: 3, reps: 28 });
  assert.deepEqual(after.plans[0].history.map((h) => h.flexion), [30, 60]);
  assert.deepEqual(after.plans[1].history.map((h) => h.flexion), [10]); // el otro ejercicio no cambia
  assert.deepEqual(before.plans[0].history.map((h) => h.flexion), [30]);
  assert.equal(before.totals.sessions, 2);
});

test("newAchievements solo devuelve lo que esta sesión desbloqueó", () => {
  const first = newAchievements({ totals: { sessions: 0, reps: 0 }, plans: [withHistory([], { plan_id: 1 })] }, 1, { reps_completed: 10, flexion: 20 });
  assert.deepEqual(first.map((a) => a.id), ["first_session"]);
  const tenth = newAchievements({ totals: { sessions: 9, reps: 90 }, plans: [withHistory([20], { plan_id: 1 })] }, 1, { reps_completed: 12, flexion: 50 });
  assert.deepEqual(tenth.map((a) => a.id).sort(), ["halfway", "reps_100", "sessions_10"]);
  assert.deepEqual(newAchievements({ totals: { sessions: 12, reps: 150 }, plans: [withHistory([20], { plan_id: 1 })] }, 1, { reps_completed: 5, flexion: 25 }), []);
});

test("newAchievements tolera una sesión sin flexión medida", () => {
  const out = newAchievements({ totals: { sessions: 0, reps: 0 }, plans: [withHistory([], { plan_id: 1 })] }, 1, { reps_completed: 3, flexion: null });
  assert.deepEqual(out.map((a) => a.id), ["first_session"]);
});
