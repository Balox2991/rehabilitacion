import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TRACE_CHARS, buildSessionPayload, traceForUpload } from "../src/lib/sessionPayload.js";
import { generateReps } from "../../tracking-prototype/tests/helpers/signals.mjs";

const plan = { exercise_code: "knee_flexion", side: "right", target_angle: 90, plan_id: 4, sets: 1, reps_per_set: 10 };
const snap = (reps = []) => ({ started_at: new Date("2026-10-05T15:00:00Z"), ended_at: new Date("2026-10-05T15:02:00Z"), reps });
const live = (n) => Array.from({ length: n }, () => ({ rom_achieved: 99, compensation_flags: [] }));
function trace(samples, extra = {}) {
  return {
    format: "telerehab-trace/2",
    meta: { exercise: "knee_flexion", side: "right", targetAngle: 90, restAngle: 175, direction: "decreasing" },
    t: samples.map((s) => s[1]), angle: samples.map((s) => s[0]), vis: samples.map(() => 1),
    skeleton: { joints: ["right_knee"], stride: 2, frames: samples.filter((_, i) => i % 2 === 0).map(() => [400, 300]) },
    flags: [],
    ...extra,
  };
}

test("con registro: las repeticiones guardadas salen del análisis posterior, no del conteo en vivo", () => {
  const { body, source, analysis } = buildSessionPayload({ plan, snap: snap(live(3)), trace: trace(generateReps({ reps: 8, restAngle: 175, peakAngle: 88, noiseSd: 2, seed: 3 })) });
  assert.equal(source, "posterior");
  assert.equal(body.reps.length, 8);
  assert.equal(analysis.summary.count, 8);
  assert.ok(body.reps.every((r) => r.rom_achieved > 80 && r.rom_achieved < 95 && Array.isArray(r.compensation_flags)));
  assert.equal(body.trace.format, "telerehab-trace/2");
  assert.equal(body.plan_id, 4);
  assert.equal(body.started_at, "2026-10-05T15:00:00.000Z");
});

test("las alertas de postura del análisis viajan con su repetición", () => {
  const samples = generateReps({ reps: 4, restAngle: 175, peakAngle: 88 });
  const { body } = buildSessionPayload({ plan, snap: snap(), trace: trace(samples, { flags: [[0, ["Inclinación de tronco"]]] }) });
  assert.ok(body.reps.every((r) => r.compensation_flags.includes("Inclinación de tronco")));
});

test("si el análisis no encuentra repeticiones pero en vivo sí, se conserva lo contado en vivo", () => {
  const still = trace(generateReps({ reps: 0, restAngle: 140, peakAngle: 140, noiseSd: 2, leadMs: 8000, seed: 2 }));
  const { body, source } = buildSessionPayload({ plan, snap: snap(live(5)), trace: still });
  assert.equal(source, "en_vivo");
  assert.equal(body.reps.length, 5);
});

test("si el análisis lanza un error, la sesión se guarda con lo contado en vivo (nunca se pierde)", () => {
  const broken = { format: "telerehab-trace/2", meta: null, t: [1], angle: [1], vis: [1] };
  const { body, source, analysis } = buildSessionPayload({ plan, snap: snap(live(4)), trace: broken });
  assert.equal(source, "en_vivo");
  assert.equal(analysis, null);
  assert.equal(body.reps.length, 4);
});

test("sin registro (cámara que nunca arrancó): se guarda lo contado en vivo y no se envía `trace`", () => {
  const { body, source } = buildSessionPayload({ plan, snap: snap(live(2)), trace: null });
  assert.equal(source, "en_vivo");
  assert.ok(!("trace" in body));
});

test("registro demasiado grande: primero se quita el esqueleto; si aun así no cabe, se envía sin registro", () => {
  const t = trace(generateReps({ reps: 4, restAngle: 175, peakAngle: 90 }));
  assert.equal(traceForUpload(t), t);
  const noSkeleton = traceForUpload(t, JSON.stringify(t).length - 10);
  assert.equal(noSkeleton.skeleton, null);
  assert.ok(noSkeleton.t.length > 0);
  assert.equal(traceForUpload(t, 100), null);
  assert.equal(traceForUpload(null), null);
  assert.ok(MAX_TRACE_CHARS < 3_000_000);
});
