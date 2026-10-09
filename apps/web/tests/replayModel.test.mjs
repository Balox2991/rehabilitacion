import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMBS, buildReplayModel, indexAt, measuredJoints, poseAt, repAt } from "../src/lib/replayModel.js";
import { analyzeSession } from "../../tracking-prototype/src/analysis.js";
import { SKELETON_JOINTS } from "../../tracking-prototype/src/traceRecorder.js";
import { generateReps } from "../../tracking-prototype/tests/helpers/signals.mjs";

function makeTrace(over = {}) {
  const samples = generateReps({ reps: 5, restAngle: 175, peakAngle: 88, noiseSd: 1.5, seed: 2 });
  const t = samples.map((s) => s[1]);
  return {
    format: "telerehab-trace/2",
    meta: { exercise: "knee_flexion", side: "right", targetAngle: 90, restAngle: 175, direction: "decreasing", width: 640, height: 480 },
    t, angle: samples.map((s) => s[0]), vis: t.map(() => 1),
    skeleton: { joints: SKELETON_JOINTS, stride: 2, frames: t.filter((_, i) => i % 2 === 0).map((_, k) => SKELETON_JOINTS.flatMap((__, j) => [100 + j * 10 + k, 200 + j * 5])) },
    flags: [],
    ...over,
  };
}

test("indexAt: última lectura con tiempo ≤ pos, con bordes", () => {
  const times = [0, 33, 66, 100, 133];
  assert.equal(indexAt(times, -50), 0);
  assert.equal(indexAt(times, 0), 0);
  assert.equal(indexAt(times, 50), 1);
  assert.equal(indexAt(times, 100), 3);
  assert.equal(indexAt(times, 99999), 4);
  assert.equal(indexAt([], 10), 0);
});

test("los segmentos y las articulaciones medidas usan nombres que existen en el registro", () => {
  for (const [a, b] of LIMBS) assert.ok(SKELETON_JOINTS.includes(a) && SKELETON_JOINTS.includes(b));
  assert.deepEqual(measuredJoints("knee_flexion", "right"), ["right_hip", "right_knee", "right_ankle"]);
  assert.deepEqual(measuredJoints("shoulder_flexion", "left"), ["left_hip", "left_shoulder", "left_elbow"]);
  assert.deepEqual(measuredJoints("straight_leg_raise", "right"), ["right_hip", "right_knee"]); // un segmento: dos puntos
  assert.deepEqual(measuredJoints("otro", "left"), []);
  assert.equal(measuredJoints("elbow_flexion", "right").every((j) => SKELETON_JOINTS.includes(j)), true);
});

test("poseAt escala los puntos al tamaño de la imagen y reporta la flexión suavizada", () => {
  const trace = makeTrace();
  const model = buildReplayModel(trace, analyzeSession(trace));
  assert.equal(model.duration, trace.t[trace.t.length - 1]);
  const p = poseAt(model, 0);
  assert.equal(p.hasSkeleton, true);
  assert.deepEqual(p.points.left_shoulder, { x: (100 / 1000) * 640, y: (200 / 1000) * 480 });
  assert.ok(p.flexion != null && Math.abs(p.flexion - 5) < 6, `flexión en reposo ${p.flexion}`); // 180 − 175
  assert.equal(p.visible, true);
});

test("la flexión del replay sigue el movimiento: llega al extremo de cada repetición", () => {
  const trace = makeTrace();
  const analysis = analyzeSession(trace);
  const model = buildReplayModel(trace, analysis);
  const rep = analysis.reps[1];
  const atPeak = poseAt(model, rep.t_peak_s * 1000);
  assert.ok(Math.abs(atPeak.flexion - rep.flexion) < 5, `${atPeak.flexion} vs ${rep.flexion}`);
  assert.equal(atPeak.rep, rep.n);
  assert.equal(poseAt(model, 200).rep, null); // reposo inicial: ninguna repetición en curso
});

test("repAt devuelve la repetición según el tiempo, con bordes incluidos", () => {
  const trace = makeTrace();
  const analysis = analyzeSession(trace);
  const model = buildReplayModel(trace, analysis);
  const r = analysis.reps[0];
  assert.equal(repAt(model, r.t_start_s * 1000).n, 1);
  assert.equal(repAt(model, r.t_end_s * 1000).n, 1);
  assert.equal(repAt(model, 0), null);
});

test("lecturas con visibilidad baja: el muñeco se marca como «no visible» y la flexión no se inventa", () => {
  const trace = makeTrace();
  trace.vis = trace.vis.map((_, i) => (trace.t[i] > 4000 && trace.t[i] < 6000 ? 0.1 : 1));
  const model = buildReplayModel(trace, analyzeSession(trace));
  const p = poseAt(model, 5000);
  assert.equal(p.visible, false);
  assert.equal(p.flexion, null); // más de 500 ms sin lecturas confiables
  assert.equal(poseAt(model, 3000).visible, true);
});

test("registro sin esqueleto (se quitó por tamaño) o vacío: no revienta y avisa que no hay muñeco", () => {
  const noSk = makeTrace({ skeleton: null });
  const p = poseAt(buildReplayModel(noSk, analyzeSession(noSk)), 1000);
  assert.equal(p.hasSkeleton, false);
  assert.deepEqual(p.points, {});
  const empty = { format: "telerehab-trace/2", meta: { direction: "decreasing", targetAngle: 90, restAngle: 175 }, t: [], angle: [], vis: [], flags: [] };
  const m = buildReplayModel(empty, analyzeSession(empty));
  assert.equal(m.duration, 0);
  assert.doesNotThrow(() => poseAt(m, 0));
});

test("en el hombro (dirección contraria) la flexión es el ángulo", () => {
  const samples = generateReps({ reps: 4, restAngle: 15, peakAngle: 120, seed: 1 });
  const t = samples.map((s) => s[1]);
  const trace = { format: "telerehab-trace/2", meta: { exercise: "shoulder_flexion", side: "left", targetAngle: 150, restAngle: 15, direction: "increasing", width: 640, height: 480 }, t, angle: samples.map((s) => s[0]), vis: t.map(() => 1), skeleton: null, flags: [] };
  const analysis = analyzeSession(trace);
  const model = buildReplayModel(trace, analysis);
  assert.ok(Math.abs(poseAt(model, analysis.reps[0].t_peak_s * 1000).flexion - 120) < 6);
});
