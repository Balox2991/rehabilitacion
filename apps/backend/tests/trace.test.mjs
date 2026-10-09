import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, SKELETON_JOINTS, parseTrace } from "../src/trace.js";

const good = (over = {}) => ({
  format: "telerehab-trace/2",
  meta: { width: 640, height: 480, model: "full", startedAt: "2026-10-05T15:00:00.000Z", extra: "se descarta" },
  t: [0, 33, 66, 100],
  angle: [175, 170.5, 160, 150],
  vis: [1, 0.9, 1, 0.4],
  skeleton: { joints: ["right_hip", "right_knee", "right_ankle"], stride: 2, frames: [[400, 200, 400, 300, 450, 400], [401, 201, 402, 301, 452, 402]] },
  flags: [[0, []], [60, ["Inclinación de tronco"]]],
  ...over,
});

test("acepta un registro válido y descarta lo que no conoce de meta", () => {
  const r = parseTrace(good());
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.trace.meta, { width: 640, height: 480, model: "full", startedAt: "2026-10-05T15:00:00.000Z" });
  assert.equal(r.trace.t.length, 4);
  assert.equal(r.trace.skeleton.frames.length, 2);
});

test("el esqueleto y las banderas son opcionales", () => {
  const r = parseTrace(good({ skeleton: undefined, flags: undefined }));
  assert.ok(!r.error);
  assert.equal(r.trace.skeleton, null);
  assert.deepEqual(r.trace.flags, []);
});

test("rechaza lo que no es un objeto o no tiene el formato esperado (incluido el formato anterior)", () => {
  for (const bad of [null, undefined, "x", 5, [], { format: "telerehab-trace/1" }, good({ format: "otro" })]) {
    assert.match(parseTrace(bad).error, /trace:/);
  }
});

test("t, angle y vis deben ser listas del mismo largo", () => {
  assert.match(parseTrace(good({ angle: [1, 2] })).error, /mismo largo/);
  assert.match(parseTrace(good({ vis: undefined })).error, /listas/);
});

test("valida cada lectura: tiempo entero y creciente, ángulo 0–180, visibilidad 0–1, solo números", () => {
  assert.match(parseTrace(good({ t: [0, 33, 20, 100] })).error, /t\[2\]/);
  assert.match(parseTrace(good({ t: [0, 33.5, 66, 100] })).error, /t\[1\]/);
  assert.match(parseTrace(good({ t: [-1, 33, 66, 100] })).error, /t\[0\]/);
  assert.match(parseTrace(good({ angle: [175, 181, 160, 150] })).error, /angle\[1\]/);
  assert.match(parseTrace(good({ angle: [175, "170", 160, 150] })).error, /angle\[1\]/);
  assert.match(parseTrace(good({ angle: [175, NaN, 160, 150] })).error, /angle\[1\]/);
  assert.match(parseTrace(good({ vis: [1, 2, 1, 1] })).error, /vis\[1\]/);
});

test("límite de lecturas", () => {
  const n = LIMITS.samples + 1;
  const big = good({ t: Array.from({ length: n }, (_, i) => i), angle: new Array(n).fill(90), vis: new Array(n).fill(1), skeleton: undefined });
  assert.match(parseTrace(big).error, /máximo/);
  const exact = good({ t: Array.from({ length: LIMITS.samples }, (_, i) => i), angle: new Array(LIMITS.samples).fill(90), vis: new Array(LIMITS.samples).fill(1), skeleton: undefined });
  assert.ok(!parseTrace(exact).error);
});

test("esqueleto: solo puntos conocidos, sin repetir, con el largo de cuadro correcto y coordenadas razonables", () => {
  const sk = (o) => ({ joints: ["right_knee"], stride: 2, frames: [[400, 300]], ...o });
  assert.match(parseTrace(good({ skeleton: sk({ joints: ["nariz"] }) })).error, /joints/);
  assert.match(parseTrace(good({ skeleton: sk({ joints: ["right_knee", "right_knee"], frames: [[1, 2, 3, 4]] }) })).error, /joints/);
  assert.match(parseTrace(good({ skeleton: sk({ joints: [] }) })).error, /joints/);
  assert.match(parseTrace(good({ skeleton: sk({ stride: 0 }) })).error, /stride/);
  assert.match(parseTrace(good({ skeleton: sk({ frames: [[400]] }) })).error, /frames\[0\]/);
  assert.match(parseTrace(good({ skeleton: sk({ frames: [[400, "300"]] }) })).error, /frames\[0\]/);
  assert.match(parseTrace(good({ skeleton: sk({ frames: [[400, 9999]] }) })).error, /frames\[0\]/);
  assert.match(parseTrace(good({ skeleton: sk({ frames: new Array(10).fill([1, 2]) }) })).error, /frames/); // más cuadros que lecturas
  assert.ok(!parseTrace(good({ skeleton: { joints: SKELETON_JOINTS, stride: 1, frames: [new Array(24).fill(500)] } })).error);
});

test("banderas: [milisegundos, [textos cortos]]", () => {
  assert.match(parseTrace(good({ flags: [[0, "x"]] })).error, /flags\[0\]/);
  assert.match(parseTrace(good({ flags: [["0", []]] })).error, /flags\[0\]/);
  assert.match(parseTrace(good({ flags: [[0, [5]]] })).error, /flags\[0\]/);
  assert.match(parseTrace(good({ flags: [[0, ["x".repeat(LIMITS.flagLength + 1)]]] })).error, /flags\[0\]/);
  assert.match(parseTrace(good({ flags: "no" })).error, /flags/);
  assert.match(parseTrace(good({ flags: new Array(LIMITS.flagEvents + 1).fill([0, []]) })).error, /flags/);
});
