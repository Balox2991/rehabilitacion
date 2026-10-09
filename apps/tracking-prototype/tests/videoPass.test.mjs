import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STEP_MS, runPosePass } from "../src/videoPass.js";
import { analyzeSession } from "../src/analysis.js";
import { EXERCISES, LANDMARKS } from "../src/angleMath.js";
import { generateReps } from "./helpers/signals.mjs";

const FRAME = { width: 640, height: 480 };

// Cuerpo sintético: rodilla derecha con el ángulo interno dado (en píxeles reales, como lo ve la cámara).
function kneePose(theta, { visibility = 1, lean = 0 } = {}) {
  const rad = (theta * Math.PI) / 180;
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const P = (x, y, v = 1) => ({ x: x / FRAME.width, y: y / FRAME.height, visibility: v });
  const len = 130;
  lm[LANDMARKS.RIGHT_HIP] = P(330, 150);
  lm[LANDMARKS.RIGHT_KNEE] = P(330, 150 + len, visibility);
  lm[LANDMARKS.RIGHT_ANKLE] = P(330 + len * Math.sin(rad), 150 + len - len * Math.cos(rad), visibility);
  lm[LANDMARKS.LEFT_HIP] = P(250, 150);
  lm[LANDMARKS.LEFT_SHOULDER] = P(250 + lean, 50);
  lm[LANDMARKS.RIGHT_SHOULDER] = P(330 + lean, 50);
  return lm;
}

// Un «video» de 8 repeticiones: el ángulo de cada instante sale de la señal sintética (interpolada por tiempo).
function fakeVideo(over = {}) {
  const samples = generateReps({ reps: 8, restAngle: 175, peakAngle: 90, noiseSd: 1.5, seed: 5, fps: 60, ...over });
  const at = (t) => samples[Math.min(samples.length - 1, Math.round(t / (1000 / 60)))][0];
  return { samples, durationMs: samples[samples.length - 1][1], at };
}

const opts = (v, extra = {}) => ({ durationMs: v.durationMs, exercise: EXERCISES.knee_flexion, side: "right", targetAngle: 90, frame: FRAME, ...extra });

test("recorre el video, arma el registro y el análisis cuenta las repeticiones", async () => {
  const v = fakeVideo();
  const out = await runPosePass({ ...opts(v), getLandmarks: (t) => kneePose(v.at(t)) });
  assert.equal(out.cancelled, false);
  assert.equal(out.trace.format, "telerehab-trace/2");
  assert.equal(out.trace.meta.width, 640);
  assert.ok(out.trace.t.length > 100);
  assert.equal(out.trace.t[1] - out.trace.t[0], DEFAULT_STEP_MS);
  assert.equal(out.trace.skeleton.frames.length > 0, true);
  const a = analyzeSession(out.trace);
  assert.equal(a.summary.count, 8);
  for (const r of a.reps) assert.ok(Math.abs(r.angle - 90) < 4, `rep ${r.n}: ${r.angle}`);
});

test("el ángulo se mide en píxeles reales: el esqueleto 4:3 da el ángulo verdadero", async () => {
  const out = await runPosePass({ ...opts({ durationMs: 400 }), getLandmarks: () => kneePose(120) });
  for (const a of out.trace.angle) assert.ok(Math.abs(a - 120) < 0.2, `${a}`);
});

test("cuadros donde no se ve a nadie (null) no se registran y se cuentan aparte", async () => {
  const v = fakeVideo();
  const out = await runPosePass({ ...opts(v), getLandmarks: (t) => (t > 5000 && t < 7000 ? null : kneePose(v.at(t))) });
  assert.ok(out.seen < out.total);
  const covered = out.trace.t.filter((t) => t > 5000 && t < 7000).length;
  assert.equal(covered, 0);
});

test("articulación tapada (visibilidad baja): el registro lo marca y el análisis la descarta", async () => {
  const v = fakeVideo();
  const out = await runPosePass({ ...opts(v), getLandmarks: (t) => kneePose(t > 4000 && t < 6000 ? 30 : v.at(t), { visibility: t > 4000 && t < 6000 ? 0.1 : 1 }) });
  const a = analyzeSession(out.trace);
  assert.ok(a.visible_pct < 100);
  assert.ok(a.reps.every((r) => r.angle > 80)); // el ángulo basura (30°) del tramo tapado no entra
});

test("la postura de referencia es la del primer cuadro: inclinar el tronco después genera la alerta", async () => {
  const v = fakeVideo();
  const out = await runPosePass({ ...opts(v), getLandmarks: (t) => kneePose(v.at(t), { lean: t > 3000 ? 80 : 0 }) });
  assert.ok(out.trace.flags.some(([, names]) => names.includes("Inclinación de tronco")));
  const a = analyzeSession(out.trace);
  assert.ok(a.summary.flagged_reps > 0);
});

test("informa el progreso de 0 a 1, en orden creciente", async () => {
  const v = fakeVideo();
  const seen = [];
  await runPosePass({ ...opts(v), getLandmarks: (t) => kneePose(v.at(t)), onProgress: (f) => seen.push(f) });
  assert.ok(seen.length > 10);
  assert.equal(seen[seen.length - 1], 1);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
});

test("se puede cancelar a la mitad", async () => {
  const v = fakeVideo();
  let calls = 0;
  const out = await runPosePass({ ...opts(v), getLandmarks: (t) => { calls++; return kneePose(v.at(t)); }, shouldStop: () => calls >= 40 });
  assert.equal(out.cancelled, true);
  assert.equal(calls, 40);
  assert.equal(out.trace, undefined);
});

test("getLandmarks asíncrono (el navegador espera a que el video llegue al cuadro) funciona igual", async () => {
  const v = fakeVideo({ reps: 4 });
  const out = await runPosePass({ ...opts(v), getLandmarks: async (t) => { await Promise.resolve(); return kneePose(v.at(t)); } });
  assert.equal(analyzeSession(out.trace).summary.count, 4);
});

test("un video sin nadie: registro vacío, sin errores", async () => {
  const out = await runPosePass({ ...opts({ durationMs: 2000 }), getLandmarks: () => null });
  assert.equal(out.seen, 0);
  assert.equal(out.trace.t.length, 0);
  assert.equal(analyzeSession(out.trace).summary.count, 0);
});
