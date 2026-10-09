import test from "node:test";
import assert from "node:assert/strict";
import { replayTrace } from "../src/replay.js";
import { generateReps } from "./helpers/signals.mjs";

const trace = (samples, over = {}) => ({
  format: "telerehab-trace/2",
  meta: { exercise: "knee_flexion", side: "right", targetAngle: 90, restAngle: 175, direction: "decreasing", model: "full" },
  t: samples.map((s) => s[1]),
  angle: samples.map((s) => s[0]),
  vis: samples.map(() => 1),
  flags: [],
  manual_count: null,
  ...over,
});

test("reproduce un registro sin cámara y entrega el conteo en vivo y el posterior", () => {
  const r = replayTrace(trace(generateReps({ reps: 7, restAngle: 175, peakAngle: 110, noiseSd: 3, seed: 8 })));
  assert.equal(r.live.detected, 7);
  assert.equal(r.offline.detected, 7);
  assert.ok(r.offline.reps.every((x) => x.reached_target === false)); // 110° (70° de flexión) no llega a la meta de 90°
});

test("compara ambos conteos con el que hizo la persona a mano", () => {
  const samples = generateReps({ reps: 6, restAngle: 175, peakAngle: 90 });
  const ok = replayTrace(trace(samples, { manual_count: 6 }));
  assert.deepEqual([ok.differenceLive, ok.differenceOffline], [0, 0]);
  const off = replayTrace(trace(samples, { manual_count: 8 }));
  assert.deepEqual([off.differenceLive, off.differenceOffline], [-2, -2]);
});

test("las lecturas con visibilidad baja no se usan (la articulación estaba tapada)", () => {
  const t = trace(generateReps({ reps: 4, restAngle: 175, peakAngle: 90 }));
  t.angle = t.angle.map((a, i) => (i % 2 ? 20 : a));
  t.vis = t.vis.map((_, i) => (i % 2 ? 0.1 : 1));
  const r = replayTrace(t);
  assert.equal(r.live.detected, 4);
  assert.equal(r.offline.detected, 4);
  assert.ok(r.samplesHidden > 0);
});

test("permite probar otros umbrales del conteo en vivo", () => {
  const samples = generateReps({ reps: 5, restAngle: 175, peakAngle: 100 });
  assert.equal(replayTrace(trace(samples)).live.detected, 5);
  assert.equal(replayTrace(trace(samples), { minExcursionDeg: 90 }).live.detected, 0);
});

test("rechaza archivos que no son un registro de sesión (incluido el formato anterior)", () => {
  assert.throws(() => replayTrace({ foo: 1 }), /Formato/);
  assert.throws(() => replayTrace(null), /Formato/);
  assert.throws(() => replayTrace({ format: "telerehab-trace/1" }), /Formato/);
});
