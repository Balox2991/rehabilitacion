import { test } from "node:test";
import assert from "node:assert/strict";
import { insightText, orderedInsights, repBarsModel } from "../src/lib/insights.js";
import { THRESHOLDS, rules } from "../../tracking-prototype/src/analysis.js";

const ALL_CODES = ["low_visibility", "no_reps", "interrupted", "incomplete", "target_not_reached", "fatigue", "fast_up", "fast_down", "short_hold", "irregular_rhythm", "posture", "well_done"];
const SAMPLE = {
  low_visibility: { pct: 62 }, interrupted: { count: 2 }, incomplete: { done: 4, expected: 10 }, target_not_reached: { best: 70.5, target: 90 },
  fatigue: { drop_pct: 21.34, first: 80, last: 63 }, fast_up: { seconds: 0.4 }, fast_down: { seconds: 0.5 }, short_hold: { seconds: 0.8, expected: 3 },
  irregular_rhythm: { cv_pct: 48.2 }, posture: { pct: 40 },
};

test("todos los códigos del motor tienen texto para el paciente y para el fisioterapeuta", () => {
  for (const code of ALL_CODES) for (const who of ["patient", "therapist"]) {
    const t = insightText({ code, severity: "info", data: SAMPLE[code] ?? {} }, who);
    assert.ok(t.title && t.text.length > 10, `${code}/${who}`);
    assert.ok(!/undefined|NaN|\[object/.test(t.text), `${code}/${who}: ${t.text}`);
  }
});

test("los códigos que genera el motor son exactamente los que tienen texto (si se agrega uno, esta prueba avisa)", () => {
  const seen = new Set();
  const summary = (o) => ({ count: 8, interrupted: 1, reached_target: 0, rom: { best: 70, drop_pct: 30, first_third: 80, last_third: 56 }, tempo: { up_s: 0.3, down_s: 0.3, hold_s: 0.2, cycle_cv_pct: 60 }, flagged_pct: 50, ...o });
  const ctx = { visiblePct: 50, expectedReps: 40, holdSeconds: 3, target: 90 };
  for (const s of rules([], summary({ count: 0 }), ctx)) seen.add(s.code);
  for (const s of rules([], summary({}), ctx)) seen.add(s.code);
  for (const s of rules([], summary({ interrupted: 0, rom: { best: 90, drop_pct: 0 }, reached_target: 5, tempo: { up_s: 1.2, down_s: 1.2, hold_s: 3, cycle_cv_pct: 5 }, flagged_pct: 0 }), { ...ctx, visiblePct: 100, expectedReps: 8 })) seen.add(s.code);
  assert.deepEqual([...seen].sort(), [...ALL_CODES].sort());
});

test("el mismo hallazgo se dice distinto al paciente (sin culpar) y al fisioterapeuta (con cifras)", () => {
  const s = { code: "fatigue", severity: "warn", data: SAMPLE.fatigue };
  const p = insightText(s, "patient"), t = insightText(s, "therapist");
  assert.match(p.text, /cansancio/i);
  assert.match(t.text, /21,3 %/);
  assert.match(t.text, /80°/);
  assert.notEqual(p.text, t.text);
  assert.equal(p.tone, "warn");
});

test("los números salen con coma decimal y un decimal a lo sumo", () => {
  assert.match(insightText({ code: "target_not_reached", data: SAMPLE.target_not_reached }, "therapist").text, /70,5°/);
  assert.match(insightText({ code: "fast_up", data: { seconds: 0.4 } }, "therapist").text, /0,4 s/);
});

test("singular y plural en repeticiones interrumpidas", () => {
  assert.match(insightText({ code: "interrupted", data: { count: 1 } }, "patient").text, /1 repetición la cámara perdió.*no se contó\./);
  assert.match(insightText({ code: "interrupted", data: { count: 3 } }, "therapist").text, /3 repeticiones descartadas/);
});

test("un código desconocido (motor más nuevo que la pantalla) no rompe", () => {
  const t = insightText({ code: "algo_nuevo", severity: "info", data: {} }, "patient");
  assert.equal(t.text, "algo_nuevo");
  assert.doesNotThrow(() => insightText(undefined, "patient"));
  assert.doesNotThrow(() => insightText({ code: "fatigue" }, "patient")); // sin data
});

test("orderedInsights pone primero lo que requiere atención, respeta el orden y admite un límite", () => {
  const list = [{ code: "irregular_rhythm", severity: "info", data: {} }, { code: "fatigue", severity: "warn", data: SAMPLE.fatigue }, { code: "short_hold", severity: "info", data: SAMPLE.short_hold }, { code: "posture", severity: "warn", data: SAMPLE.posture }];
  assert.deepEqual(orderedInsights(list, "patient").map((x) => x.code), ["fatigue", "posture", "irregular_rhythm", "short_hold"]);
  assert.equal(orderedInsights(list, "patient", 2).length, 2);
  assert.deepEqual(orderedInsights(undefined, "patient"), []);
});

test("repBarsModel: una barra por repetición, escala redondeada y meta incluida", () => {
  const analysis = { reps: [{ n: 1, flexion: 62, reached_target: false, flags: [] }, { n: 2, flexion: 88.4, reached_target: true, flags: ["Inclinación de tronco"] }] };
  const m = repBarsModel(analysis, 90);
  assert.deepEqual(m.bars, [{ n: 1, flexion: 62, reached: false, flagged: false }, { n: 2, flexion: 88.4, reached: true, flagged: true }]);
  assert.equal(m.max, 100);
  assert.equal(m.target, 90);
  assert.equal(repBarsModel({ reps: [{ n: 1, flexion: 130, reached_target: true, flags: [] }] }, 90).max, 150); // la escala crece si pasa la meta
  const empty = repBarsModel(null, null);
  assert.deepEqual([empty.bars.length, empty.max, empty.target], [0, 10, null]);
});

test("los umbrales están a la vista y son números (se discuten en la sustentación, no son criterio clínico)", () => {
  for (const v of Object.values(THRESHOLDS)) assert.ok(Number.isFinite(v) && v > 0);
});
