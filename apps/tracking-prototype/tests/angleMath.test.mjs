import test from "node:test";
import assert from "node:assert/strict";
import { calculateAngle } from "../src/angleMath.js";

test("ángulo recto (90°): A arriba, B en el origen, C a la derecha", () => {
  const a = { x: 0, y: -1 };
  const b = { x: 0, y: 0 };
  const c = { x: 1, y: 0 };
  assert.ok(Math.abs(calculateAngle(a, b, c) - 90) < 1e-6);
});

test("ángulo extendido (180°): A, B, C colineales", () => {
  const a = { x: -1, y: 0 };
  const b = { x: 0, y: 0 };
  const c = { x: 1, y: 0 };
  assert.ok(Math.abs(calculateAngle(a, b, c) - 180) < 1e-6);
});

test("ángulo cerrado (~0°): A y C casi en el mismo punto respecto a B", () => {
  const a = { x: 1, y: 0.001 };
  const b = { x: 0, y: 0 };
  const c = { x: 1, y: 0 };
  assert.ok(calculateAngle(a, b, c) < 1);
});

test("rodilla a 90° de flexión (caso realista, coordenadas tipo imagen)", () => {
  // Cadera arriba, rodilla en el centro, tobillo formando 90° hacia la izquierda.
  const hip = { x: 0.5, y: 0.3 };
  const knee = { x: 0.5, y: 0.6 };
  const ankle = { x: 0.2, y: 0.6 };
  assert.ok(Math.abs(calculateAngle(hip, knee, ankle) - 90) < 1e-6);
});

test("devuelve NaN si falta un landmark (oclusión)", () => {
  const b = { x: 0, y: 0 };
  const c = { x: 1, y: 0 };
  assert.ok(Number.isNaN(calculateAngle(undefined, b, c)));
});

test("devuelve NaN si dos puntos coinciden (vector de magnitud 0)", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  const c = { x: 1, y: 0 };
  assert.ok(Number.isNaN(calculateAngle(a, b, c)));
});

import { MIN_VISIBILITY, measureJoint, toPixelSpace } from "../src/angleMath.js";
import { EXERCISES, LANDMARKS } from "../src/angleMath.js";

test("COORDENADAS NORMALIZADAS DEFORMAN EL ÁNGULO: un ángulo real de 90° inclinado 45° en 640×480 se medía como ~74°", () => {
  const W = 640, H = 480;
  const px = [{ x: 300, y: 100 }, { x: 400, y: 200 }, { x: 500, y: 100 }]; // ángulo real: 90°
  const norm = px.map((p) => ({ x: p.x / W, y: p.y / H }));
  const bad = calculateAngle(...norm);
  assert.ok(Math.abs(bad - 90) > 10, `sin corregir da ${bad.toFixed(1)}°`);
  const good = calculateAngle(...toPixelSpace(norm, W, H));
  assert.ok(Math.abs(good - 90) < 1e-6, `corregido da ${good}°`);
});

test("toPixelSpace conserva visibilidad y tolera puntos ausentes", () => {
  const out = toPixelSpace([{ x: 0.5, y: 0.5, visibility: 0.9 }, undefined], 640, 480);
  assert.deepEqual(out[0], { x: 320, y: 240, visibility: 0.9 });
  assert.equal(out[1], undefined);
});

function kneePose(vis = 1) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  lm[LANDMARKS.RIGHT_HIP] = { x: 0.40, y: 0.20, visibility: 1 };
  lm[LANDMARKS.RIGHT_KNEE] = { x: 0.40 + 100 / 640, y: 0.20 + 100 / 480, visibility: vis };
  lm[LANDMARKS.RIGHT_ANKLE] = { x: 0.40 + 200 / 640, y: 0.20, visibility: 1 };
  return lm;
}

test("measureJoint entrega el ángulo real (90°) y la visibilidad mínima de los tres puntos", () => {
  const m = measureJoint(EXERCISES.knee_flexion, kneePose(0.7), "right", { width: 640, height: 480 });
  assert.ok(Math.abs(m.angle - 90) < 1e-6);
  assert.equal(m.visibility, 0.7);
  assert.ok(m.visibility >= MIN_VISIBILITY);
});

test("measureJoint con un punto ausente: ángulo NaN y visibilidad 0 (no se debe usar)", () => {
  const lm = kneePose();
  lm[LANDMARKS.RIGHT_ANKLE] = undefined;
  const m = measureJoint(EXERCISES.knee_flexion, lm, "right", { width: 640, height: 480 });
  assert.ok(Number.isNaN(m.angle));
  assert.equal(m.visibility, 0);
});
