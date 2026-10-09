import test from "node:test";
import assert from "node:assert/strict";
import { CompensationDetector } from "../src/compensation.js";
import { LANDMARKS } from "../src/angleMath.js";

function makeLandmarks({ shoulder, hip }) {
  const lm = new Array(33).fill(null);
  lm[LANDMARKS.LEFT_SHOULDER] = shoulder;
  lm[LANDMARKS.RIGHT_SHOULDER] = shoulder;
  lm[LANDMARKS.LEFT_HIP] = hip;
  lm[LANDMARKS.RIGHT_HIP] = hip;
  return lm;
}

test("sin calibrar, no genera ninguna bandera", () => {
  const detector = new CompensationDetector();
  const lm = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  const result = detector.check(lm, "knee_flexion");
  assert.deepEqual(result.flags, []);
});

test("postura estable (igual a la calibración) no genera banderas", () => {
  const detector = new CompensationDetector();
  const baseline = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  detector.calibrate(baseline);
  const result = detector.check(baseline, "knee_flexion");
  assert.deepEqual(result.flags, []);
});

test("inclinación de tronco: el torso se inclina más allá del umbral", () => {
  const detector = new CompensationDetector({ trunkLeanThresholdDeg: 15 });
  const baseline = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  detector.calibrate(baseline);

  // Desplazamos el hombro en x manteniendo la cadera: genera ~26.5° de inclinación
  const leaned = makeLandmarks({ shoulder: { x: 0.65, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  const result = detector.check(leaned, "knee_flexion");

  assert.equal(result.trunkLean, true);
  assert.ok(result.flags.includes("Inclinación de tronco"));
});

test("elevación de cadera en ejercicio de rodilla, sin inclinación de tronco", () => {
  const detector = new CompensationDetector({ verticalShiftThreshold: 0.05 });
  const baseline = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  detector.calibrate(baseline);

  // La cadera sube (y disminuye) 0.08, en línea recta con el hombro (dx=0 -> sin inclinación)
  const hiked = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.52 } });
  const result = detector.check(hiked, "knee_flexion");

  assert.equal(result.hipHike, true);
  assert.equal(result.trunkLean, false);
});

test("elevación de hombro en ejercicio de codo", () => {
  const detector = new CompensationDetector({ verticalShiftThreshold: 0.05 });
  const baseline = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  detector.calibrate(baseline);

  const shrugged = makeLandmarks({ shoulder: { x: 0.5, y: 0.2 }, hip: { x: 0.5, y: 0.6 } });
  const result = detector.check(shrugged, "elbow_flexion");

  assert.equal(result.shoulderShrug, true);
  assert.ok(result.flags.includes("Elevación de hombro"));
});

test("un pequeño desplazamiento dentro del margen no genera banderas (evita falsos positivos)", () => {
  const detector = new CompensationDetector({ verticalShiftThreshold: 0.05, trunkLeanThresholdDeg: 15 });
  const baseline = makeLandmarks({ shoulder: { x: 0.5, y: 0.3 }, hip: { x: 0.5, y: 0.6 } });
  detector.calibrate(baseline);

  const slight = makeLandmarks({ shoulder: { x: 0.5, y: 0.31 }, hip: { x: 0.5, y: 0.61 } });
  const result = detector.check(slight, "knee_flexion");

  assert.deepEqual(result.flags, []);
});

test("la inclinación del tronco se mide con la proporción real del video (4:3): sin ella se subestimaba", () => {
  // Tronco inclinado 20° reales en un video 640×480
  const W = 640, H = 480, a = (20 * Math.PI) / 180, len = 200;
  const mk = (dxPx) => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    const hipPx = { x: 320, y: 400 };
    const shoulderPx = { x: hipPx.x + dxPx, y: hipPx.y - Math.sqrt(len * len - dxPx * dxPx) };
    for (const [i, p] of [[LANDMARKS.LEFT_HIP, hipPx], [LANDMARKS.RIGHT_HIP, hipPx], [LANDMARKS.LEFT_SHOULDER, shoulderPx], [LANDMARKS.RIGHT_SHOULDER, shoulderPx]]) lm[i] = { x: p.x / W, y: p.y / H, visibility: 1 };
    return lm;
  };
  const upright = mk(0), leaning = mk(len * Math.sin(a));
  const naive = new CompensationDetector({ trunkLeanThresholdDeg: 18 });
  naive.calibrate(upright);
  assert.equal(naive.check(leaning, "knee_flexion").trunkLean, false); // sin corregir: ve ~15°, no avisa
  const fixed = new CompensationDetector({ trunkLeanThresholdDeg: 18, aspect: W / H });
  fixed.calibrate(upright);
  assert.equal(fixed.check(leaning, "knee_flexion").trunkLean, true); // con la proporción real: 20° > 18°
});
