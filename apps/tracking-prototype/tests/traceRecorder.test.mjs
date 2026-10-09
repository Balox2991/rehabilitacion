import test from "node:test";
import assert from "node:assert/strict";
import { SKELETON_JOINTS, SKELETON_POINTS, TraceRecorder } from "../src/traceRecorder.js";
import { analyzeSession } from "../src/analysis.js";
import { generateReps } from "./helpers/signals.mjs";

const meta = { exercise: "knee_flexion", side: "right", targetAngle: 90, restAngle: 175, direction: "decreasing", model: "full", width: 640, height: 480 };
const pose = (x = 0.5, y = 0.5) => Array.from({ length: 33 }, (_, i) => ({ x: x + i / 1000, y, visibility: 1 }));

test("el tiempo se registra relativo al primer cuadro y en milisegundos enteros", () => {
  const r = new TraceRecorder(meta);
  r.addSample(51234.7, 170.04, 0.987);
  r.addSample(51268.1, 168.96, 1);
  const tr = r.build();
  assert.deepEqual(tr.t, [0, 33]);
  assert.deepEqual(tr.angle, [170, 169]);
  assert.deepEqual(tr.vis, [0.99, 1]);
  assert.equal(tr.format, "telerehab-trace/2");
});

test("guarda el esqueleto cada N lecturas con los 12 puntos en coordenadas ×1000", () => {
  const r = new TraceRecorder(meta, { skeletonEvery: 2 });
  for (let i = 0; i < 6; i++) r.addSample(i * 33, 170, 1, pose(0.4, 0.6));
  const tr = r.build();
  assert.equal(tr.skeleton.frames.length, 3); // lecturas 0, 2 y 4
  assert.equal(tr.skeleton.stride, 2);
  assert.deepEqual(tr.skeleton.joints, SKELETON_JOINTS);
  assert.equal(tr.skeleton.frames[0].length, 24);
  assert.equal(SKELETON_JOINTS.length, 12);
  // el primer punto es el hombro izquierdo (landmark 11): x = 0,4 + 11/1000
  assert.equal(tr.skeleton.frames[0][0], Math.round((0.4 + SKELETON_POINTS[0][1] / 1000) * 1000));
  assert.equal(tr.skeleton.frames[0][1], 600);
});

test("sin detección en un cuadro se repite el último esqueleto (el muñeco no desaparece ni salta a cero)", () => {
  const r = new TraceRecorder(meta, { skeletonEvery: 1 });
  r.addSample(0, 170, 1, pose(0.4, 0.6));
  r.addSample(33, 170, 0.2, null);
  const tr = r.build();
  assert.deepEqual(tr.skeleton.frames[1], tr.skeleton.frames[0]);
});

test("ignora lecturas inválidas y relojes atrasados", () => {
  const r = new TraceRecorder(meta);
  assert.equal(r.addSample(0, NaN, 1), false);
  assert.equal(r.addSample(NaN, 100, 1), false);
  assert.equal(r.addSample(100, 100, 1), true);
  assert.equal(r.addSample(50, 100, 1), false);
  assert.equal(r.length, 1);
});

test("la visibilidad se limita a 0–1", () => {
  const r = new TraceRecorder(meta);
  r.addSample(0, 100, 7);
  r.addSample(33, 100, -3);
  r.addSample(66, 100, undefined);
  assert.deepEqual(r.build().vis, [1, 0, 0]);
});

test("las alertas de postura solo se anotan cuando CAMBIAN", () => {
  const r = new TraceRecorder(meta);
  r.addSample(1000, 100, 1);
  r.setFlags(1000, []);
  r.setFlags(1033, []);
  r.setFlags(1500, ["Inclinación de tronco"]);
  r.setFlags(1533, ["Inclinación de tronco"]);
  r.setFlags(2000, []);
  assert.deepEqual(r.build().flags, [[0, []], [500, ["Inclinación de tronco"]], [1000, []]]);
});

test("tope de lecturas: al llegar al máximo deja de registrar", () => {
  const r = new TraceRecorder(meta, { maxSamples: 5 });
  for (let i = 0; i < 9; i++) r.addSample(i * 33, 100, 1);
  assert.equal(r.length, 5);
  assert.equal(r.full, true);
});

test("un registro armado con el grabador se analiza igual que la señal original (ida y vuelta)", () => {
  const samples = generateReps({ reps: 8, restAngle: 175, peakAngle: 88, noiseSd: 2, seed: 5 });
  const r = new TraceRecorder(meta);
  samples.forEach(([a, t], i) => r.addSample(100000 + t, a, 1, i % 2 ? pose() : null));
  const out = analyzeSession(r.build());
  assert.equal(out.summary.count, 8);
});

test("reset deja el grabador vacío para una sesión nueva", () => {
  const r = new TraceRecorder(meta);
  r.addSample(0, 100, 1, pose());
  r.setFlags(0, ["x"]);
  r.reset();
  const tr = r.build();
  assert.deepEqual([tr.t.length, tr.skeleton.frames.length, tr.flags.length], [0, 0, 0]);
  r.addSample(9999, 100, 1);
  assert.deepEqual(r.build().t, [0]); // el origen se vuelve a fijar
});
