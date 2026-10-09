import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, LANDMARKS, MIN_VISIBILITY, measureJoint, segmentAngle } from "../src/angleMath.js";
import { SPECS, SPEC_BY_CODE, buildExercise, measuredPointNames, validateSpec } from "../src/exerciseSpecs.js";
import { repThresholds } from "../src/repCounter.js";
import { runPosePass } from "../src/videoPass.js";
import { analyzeSession } from "../src/analysis.js";
import { RepCounter } from "../src/repCounter.js";
import { PROFILE_MAX_RATIO, FRONT_MIN_RATIO, estimateView, viewAdvice } from "../src/viewCheck.js";
import { generateReps } from "./helpers/signals.mjs";

const FRAME = { width: 640, height: 480 };
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} no está a ±${tol} de ${b}`);
const good = (over = {}) => ({ ...SPEC_BY_CODE.knee_flexion, ...over });

// ------------------------------------------------------------------ especificaciones

test("el catálogo de ejercicios del motor sale de las especificaciones (no hay una segunda lista)", () => {
  assert.deepEqual(Object.keys(EXERCISES), SPECS.map((s) => s.code));
  assert.deepEqual(Object.keys(EXERCISES), ["knee_flexion", "elbow_flexion", "shoulder_flexion", "straight_leg_raise"]);
  for (const s of SPECS) assert.equal(validateSpec(s).error, undefined, `${s.code}: ${validateSpec(s).error}`);
});

test("los índices de puntos de las especificaciones coinciden con los de MediaPipe (LANDMARKS)", () => {
  const lm = Array.from({ length: 33 }, (_, i) => ({ x: i, y: 0, visibility: 1 }));
  const k = EXERCISES.knee_flexion;
  assert.deepEqual(k.getPoints(lm, "right").map((p) => p.x), [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE, LANDMARKS.RIGHT_ANKLE]);
  assert.deepEqual(k.getPoints(lm, "left").map((p) => p.x), [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_KNEE, LANDMARKS.LEFT_ANKLE]);
  assert.deepEqual(EXERCISES.shoulder_flexion.getPoints(lm, "left").map((p) => p.x), [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_ELBOW]);
  assert.deepEqual(EXERCISES.straight_leg_raise.getPoints(lm, "right").map((p) => p.x), [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE]); // segmento: 2 puntos
});

test("los tres ejercicios originales conservan exactamente sus valores (nada cambió al pasar a especificaciones)", () => {
  const e = EXERCISES;
  assert.deepEqual([e.knee_flexion.restAngleApprox, e.knee_flexion.defaultTargetAngle, e.knee_flexion.direction], [175, 90, "decreasing"]);
  assert.deepEqual([e.elbow_flexion.restAngleApprox, e.elbow_flexion.defaultTargetAngle, e.elbow_flexion.direction], [170, 60, "decreasing"]);
  assert.deepEqual([e.shoulder_flexion.restAngleApprox, e.shoulder_flexion.defaultTargetAngle, e.shoulder_flexion.direction], [15, 150, "increasing"]);
  assert.equal(e.knee_flexion.kind, "joint");
  assert.equal(e.knee_flexion.label, "Flexión de rodilla");
});

test("validateSpec acepta una especificación válida y la normaliza", () => {
  const r = validateSpec(good({ label: "  Flexión de rodilla  ", extra: "se descarta" }));
  assert.equal(r.error, undefined);
  assert.equal(r.spec.label, "Flexión de rodilla");
  assert.ok(!("extra" in r.spec));
  assert.equal(r.spec.bodyPart, "rodilla"); // por defecto, igual a joint
});

test("validateSpec rechaza lo que no es una especificación coherente", () => {
  const bad = (over, re) => assert.match(validateSpec(good(over)).error, re);
  for (const x of [null, undefined, "x", 3, []]) assert.match(validateSpec(x).error, /objeto/);
  bad({ code: "Rodilla Flex" }, /code/);
  bad({ code: "ab" }, /code/);
  bad({ label: "" }, /label/);
  bad({ joint: "" }, /joint/);
  bad({ measure: { type: "magia" } }, /measure\.type/);
  bad({ measure: { type: "joint_angle", points: ["hip", "knee"] } }, /3 puntos/);
  bad({ measure: { type: "joint_angle", points: ["hip", "knee", "knee"] } }, /3 puntos distintos/);
  bad({ measure: { type: "joint_angle", points: ["hip", "knee", "nariz"] } }, /3 puntos/);
  bad({ measure: { type: "segment_angle", from: "hip", to: "hip", reference: "horizontal" } }, /distintos/);
  bad({ measure: { type: "segment_angle", from: "hip", to: "knee", reference: "diagonal" } }, /reference/);
  bad({ direction: "sideways" }, /direction/);
  bad({ rest: -1 }, /rest/);
  bad({ rest: 181 }, /rest/);
  bad({ target: "90" }, /target/);
  bad({ direction: "decreasing", rest: 90, target: 120 }, /sentido/); // decreciente: la meta debe ser menor que el reposo
  bad({ direction: "increasing", rest: 90, target: 60 }, /sentido/);
  bad({ view: "arriba" }, /view/);
  bad({ posture: "volando" }, /posture/);
});

test("buildExercise lanza un error claro con una especificación inválida", () => {
  assert.throws(() => buildExercise(good({ view: "x" })), /Ejercicio «knee_flexion» inválido/);
});

test("measuredPointNames: 3 puntos para un ángulo de articulación y 2 para un segmento", () => {
  assert.deepEqual(measuredPointNames(SPEC_BY_CODE.knee_flexion.measure), ["hip", "knee", "ankle"]);
  assert.deepEqual(measuredPointNames(SPEC_BY_CODE.straight_leg_raise.measure), ["hip", "knee"]);
});

test("cada ejercicio tiene umbrales de conteo razonables a partir de su recorrido", () => {
  for (const s of SPECS) {
    const t = repThresholds({ targetAngle: s.target, restAngle: s.rest, direction: s.direction });
    assert.ok(t.minExcursionDeg >= 12 && t.minExcursionDeg <= 30, `${s.code}: ${t.minExcursionDeg}`);
    assert.ok(t.startDeg >= 8 && t.startDeg <= 20, `${s.code}: ${t.startDeg}`);
  }
});

// ------------------------------------------------------------------ ángulo de segmento

test("segmentAngle contra la horizontal: elevación del segmento, igual mirando a izquierda o derecha", () => {
  const a = { x: 100, y: 100 };
  near(segmentAngle(a, { x: 200, y: 100 }, "horizontal"), 0);
  near(segmentAngle(a, { x: 200, y: 0 }, "horizontal"), 45); // sube 45° hacia la derecha
  near(segmentAngle(a, { x: 0, y: 0 }, "horizontal"), 45); // …y hacia la izquierda: el mismo valor
  near(segmentAngle(a, { x: 100, y: 0 }, "horizontal"), 90);
  near(segmentAngle(a, { x: 200, y: 160 }, "horizontal"), 0); // por debajo de la horizontal no es negativo
});

test("segmentAngle contra la vertical: 0° colgando, 90° horizontal, 180° arriba", () => {
  const a = { x: 100, y: 100 };
  near(segmentAngle(a, { x: 100, y: 200 }, "vertical"), 0);
  near(segmentAngle(a, { x: 200, y: 100 }, "vertical"), 90);
  near(segmentAngle(a, { x: 100, y: 0 }, "vertical"), 180);
  near(segmentAngle(a, { x: 200, y: 200 }, "vertical"), 45);
  near(segmentAngle(a, { x: 0, y: 200 }, "vertical"), 45);
});

test("segmentAngle: puntos ausentes, coincidentes o referencia desconocida dan NaN", () => {
  assert.ok(Number.isNaN(segmentAngle(undefined, { x: 1, y: 1 }, "horizontal")));
  assert.ok(Number.isNaN(segmentAngle({ x: 1, y: 1 }, { x: 1, y: 1 }, "horizontal")));
  assert.ok(Number.isNaN(segmentAngle({ x: 0, y: 0 }, { x: 1, y: 1 }, "diagonal")));
});

// Cuerpo sintético, acostado de perfil: el muslo derecho sube `elev` grados sobre la camilla.
function legRaisePose(elev, { vis = 1 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const P = (x, y, v = 1) => ({ x: x / FRAME.width, y: y / FRAME.height, visibility: v });
  const a = (elev * Math.PI) / 180, L = 140;
  lm[LANDMARKS.RIGHT_SHOULDER] = P(100, 300); lm[LANDMARKS.LEFT_SHOULDER] = P(100, 300);
  lm[LANDMARKS.RIGHT_HIP] = P(300, 300); lm[LANDMARKS.LEFT_HIP] = P(300, 300);
  lm[LANDMARKS.RIGHT_KNEE] = P(300 + L * Math.cos(a), 300 - L * Math.sin(a), vis);
  lm[LANDMARKS.RIGHT_ANKLE] = P(300 + 2 * L * Math.cos(a), 300 - 2 * L * Math.sin(a), vis);
  return lm;
}

test("measureJoint con un segmento: mide en píxeles reales (sin la deformación del video 4:3) y da la visibilidad de SUS dos puntos", () => {
  const m = measureJoint(EXERCISES.straight_leg_raise, legRaisePose(45), "right", FRAME);
  near(m.angle, 45, 1e-6);
  const naive = segmentAngle(...EXERCISES.straight_leg_raise.getPoints(legRaisePose(45), "right"), "horizontal"); // sin pasar a píxeles
  assert.ok(Math.abs(naive - 45) > 5, `en coordenadas normalizadas daría ${naive.toFixed(1)}°`);
  assert.equal(measureJoint(EXERCISES.straight_leg_raise, legRaisePose(45, { vis: 0.3 }), "right", FRAME).visibility, 0.3);
  const missing = legRaisePose(45);
  missing[LANDMARKS.RIGHT_KNEE] = undefined;
  const mm = measureJoint(EXERCISES.straight_leg_raise, missing, "right", FRAME);
  assert.ok(Number.isNaN(mm.angle));
  assert.equal(mm.visibility, 0);
});

// ------------------------------------------------------------------ el caso que motivó todo esto

function legRaiseVideo(reps, opts = {}) {
  const samples = generateReps({ reps, restAngle: 0, peakAngle: 45, noiseSd: 1.5, seed: 4, fps: 60, moveMs: 1200, holdMs: 800, pauseMs: 800, ...opts });
  return { durationMs: samples[samples.length - 1][1], at: (t) => samples[Math.min(samples.length - 1, Math.round(t / (1000 / 60)))][0] };
}

test("ELEVACIÓN DE PIERNA RECTA: el motor de rodilla contaba 0; con su especificación cuenta las 8 y mide ~45°", async () => {
  const v = legRaiseVideo(8);
  const old = new RepCounter({ targetAngle: 90, restAngle: 175, direction: "decreasing" });
  const knee = EXERCISES.knee_flexion;
  let oldCount = 0;
  for (let t = 0; t < v.durationMs; t += 33) if (old.update(measureJoint(knee, legRaisePose(v.at(t)), "right", FRAME).angle, t).repCompleted) oldCount++;
  assert.equal(oldCount, 0); // la rodilla nunca se dobla: este era el fallo

  const out = await runPosePass({ durationMs: v.durationMs, getLandmarks: (t) => legRaisePose(v.at(t)), exercise: EXERCISES.straight_leg_raise, side: "right", targetAngle: 45, frame: FRAME });
  const a = analyzeSession(out.trace);
  assert.equal(a.summary.count, 8);
  for (const r of a.reps) near(r.angle, 45, 4);
  assert.equal(a.summary.reached_target, 8); // llegó a la meta de 45° (tolerancia de 8°)
  assert.ok(a.reps[0].hold_s > 0.5); // el sostén de arriba se mide
});

test("elevación de pierna con un paciente que solo llega a 25° (recuperación): cuenta todo y dice que no llegó", async () => {
  const v = legRaiseVideo(6, { peakAngle: 25 });
  const out = await runPosePass({ durationMs: v.durationMs, getLandmarks: (t) => legRaisePose(v.at(t)), exercise: EXERCISES.straight_leg_raise, side: "right", targetAngle: 45, frame: FRAME });
  const a = analyzeSession(out.trace);
  assert.equal(a.summary.count, 6);
  assert.equal(a.summary.reached_target, 0);
  assert.ok(a.suggestions.some((s) => s.code === "target_not_reached"));
});

test("elevación de pierna con la rodilla tapada: se descarta y avisa en vez de contar ángulos inventados", async () => {
  const v = legRaiseVideo(6);
  const out = await runPosePass({ durationMs: v.durationMs, getLandmarks: (t) => legRaisePose(t > 6000 && t < 9000 ? 80 : v.at(t), { vis: t > 6000 && t < 9000 ? 0.1 : 1 }), exercise: EXERCISES.straight_leg_raise, side: "right", targetAngle: 45, frame: FRAME });
  const a = analyzeSession(out.trace);
  assert.ok(a.visible_pct < 100);
  assert.ok(a.reps.every((r) => r.angle < 55), "los 80° inventados del tramo tapado no entran");
  assert.ok(MIN_VISIBILITY > 0.1);
});

// ------------------------------------------------------------------ perfil o frente

function bodyPose(shoulderWidthPx) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const P = (x, y, v = 1) => ({ x: x / FRAME.width, y: y / FRAME.height, visibility: v });
  lm[LANDMARKS.LEFT_SHOULDER] = P(320 - shoulderWidthPx / 2, 100); lm[LANDMARKS.RIGHT_SHOULDER] = P(320 + shoulderWidthPx / 2, 100);
  lm[LANDMARKS.LEFT_HIP] = P(320 - shoulderWidthPx / 3, 300); lm[LANDMARKS.RIGHT_HIP] = P(320 + shoulderWidthPx / 3, 300);
  return lm; // tronco de 200 px
}

test("estimateView distingue perfil, oblicuo y frente por la separación de los hombros respecto al tronco", () => {
  assert.equal(estimateView(bodyPose(24), FRAME).view, "profile"); // razón 0,12
  assert.equal(estimateView(bodyPose(110), FRAME).view, "oblique"); // 0,55
  assert.equal(estimateView(bodyPose(160), FRAME).view, "front"); // 0,80
  assert.ok(PROFILE_MAX_RATIO < FRONT_MIN_RATIO);
});

test("estimateView: acostado de perfil también es perfil, y no depende de qué tan lejos esté la persona", () => {
  const lying = legRaisePose(0); // hombros superpuestos, tronco horizontal de 200 px
  assert.equal(estimateView(lying, FRAME).view, "profile");
  const far = bodyPose(160).map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) / 3, y: 0.5 + (p.y - 0.5) / 3 })); // la misma persona, 3 veces más lejos
  assert.equal(estimateView(far, FRAME).view, "front");
});

test("estimateView: sin los 4 puntos visibles, o con el tronco colapsado, no se puede saber (unknown)", () => {
  const hidden = bodyPose(160);
  hidden[LANDMARKS.LEFT_HIP].visibility = 0.2;
  assert.equal(estimateView(hidden, FRAME).view, "unknown");
  assert.equal(estimateView(Array.from({ length: 33 }, () => undefined), FRAME).view, "unknown");
  assert.equal(estimateView(null, FRAME).view, "unknown");
  const collapsed = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  assert.equal(estimateView(collapsed, FRAME).view, "unknown");
});

test("viewAdvice avisa solo de un desajuste claro; lo oblicuo y lo desconocido no molestan", () => {
  assert.equal(viewAdvice("profile", { view: "front" }), "turn_profile");
  assert.equal(viewAdvice("front", { view: "profile" }), "turn_front");
  for (const view of ["oblique", "unknown", "profile"]) assert.equal(viewAdvice("profile", { view }), null);
  for (const view of ["oblique", "unknown", "front"]) assert.equal(viewAdvice("front", { view }), null);
});
