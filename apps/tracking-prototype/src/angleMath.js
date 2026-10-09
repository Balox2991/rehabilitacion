/**
 * angleMath.js
 * ------------------------------------------------------------------
 * Matemática pura para calcular ángulos articulares a partir de 3
 * landmarks (puntos) del cuerpo, tal como los entrega MediaPipe Pose
 * Landmarker. No depende de MediaPipe ni del DOM: por eso se puede
 * probar con datos sintéticos (ver tests/angleMath.test.mjs).
 *
 * Convención de landmarks (BlazePose / MediaPipe Pose, 33 puntos):
 *   11 left_shoulder   12 right_shoulder
 *   13 left_elbow      14 right_elbow
 *   15 left_wrist      16 right_wrist
 *   23 left_hip        24 right_hip
 *   25 left_knee       26 right_knee
 *   27 left_ankle      28 right_ankle
 *
 * Nota de diseño (importante para la sustentación):
 * Calculamos el ángulo en 2D (x, y) sobre el plano de la imagen, no en
 * 3D. Es la misma simplificación que usan la mayoría de goniómetros
 * digitales basados en una sola cámara: es robusta y suficiente
 * mientras la extremidad se mueva aproximadamente paralela al plano
 * de la cámara. La limitación (y su mitigación: pedirle al paciente
 * que se ubique de perfil/frente según el ejercicio) queda
 * documentada en docs/FASE-1-TRACKING.md.
 */

import { SPECS, buildExercise } from "./exerciseSpecs.js";

export const LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

/**
 * Calcula el ángulo interno (en grados, 0-180) formado en el punto B
 * por los segmentos B->A y B->C. Este es el "ángulo articular"
 * estándar que reporta un goniómetro: por ejemplo, para la rodilla,
 * A = cadera, B = rodilla, C = tobillo.
 *
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b - vértice donde se mide el ángulo
 * @param {{x:number,y:number}} c
 * @returns {number} ángulo en grados, o NaN si algún punto falta
 */
export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return NaN;

  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);

  if (mag1 === 0 || mag2 === 0) return NaN;

  // Clamp por errores de precisión de punto flotante (evita NaN de acos)
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  const radians = Math.acos(cos);
  return (radians * 180) / Math.PI;
}

/**
 * Ejercicios que se miden con cámara. Ya NO están escritos aquí: cada uno es una especificación en exerciseSpecs.js
 * (qué puntos del cuerpo y qué ángulo medir) y este objeto se arma a partir de ellas. Un ejercicio nuevo es una
 * especificación nueva, sin tocar el contador, el análisis ni las pantallas.
 */
export const EXERCISES = Object.fromEntries(SPECS.map((spec) => [spec.code, buildExercise(spec)]));

/**
 * Pasa puntos de coordenadas NORMALIZADAS (0–1, como las entrega MediaPipe) a PÍXELES.
 *
 * Por qué es obligatorio: MediaPipe normaliza x por el ANCHO y y por el ALTO de la imagen. En un video 4:3 (640×480) un
 * paso de 0,1 en x son 64 px y en y son 48 px, así que los ángulos calculados directamente sobre las coordenadas
 * normalizadas se deforman: un ángulo real de 90° con la pierna inclinada 45° se medía como 73,7° (16° de error;
 * ver tests/angleMath.test.mjs). En píxeles, la geometría vuelve a ser la real.
 */
export function toPixelSpace(points, width, height) {
  return points.map((p) => (p ? { ...p, x: p.x * width, y: p.y * height } : p));
}

/**
 * Ángulo de UN segmento (de `a` a `b`) contra un eje de la imagen, en grados 0–180. Con puntos en píxeles reales.
 *  - "horizontal": elevación sobre la horizontal (0° plano, 90° vertical hacia arriba). No importa si la persona mira a la
 *    izquierda o a la derecha de la imagen (se usa el valor absoluto del avance horizontal); por debajo de la horizontal vale 0.
 *  - "vertical": separación respecto a la vertical hacia abajo (0° colgando, 90° horizontal, 180° arriba).
 * @returns {number} grados, o NaN si falta un punto o los dos puntos coinciden
 */
export function segmentAngle(a, b, reference) {
  if (!a || !b) return NaN;
  const dx = b.x - a.x;
  const dy = b.y - a.y; // en imágenes, y crece hacia abajo
  if (dx === 0 && dy === 0) return NaN;
  const deg = (r) => (r * 180) / Math.PI;
  if (reference === "horizontal") return Math.max(0, deg(Math.atan2(-dy, Math.abs(dx))));
  if (reference === "vertical") return deg(Math.atan2(Math.abs(dx), dy)); // 0° colgando … 180° arriba (el primer argumento nunca es negativo)
  return NaN;
}

/**
 * Mide el ejercicio en un frame: ángulo (grados, en píxeles reales) y la visibilidad mínima de los puntos que intervienen
 * (0–1). Con visibilidad baja el punto está tapado o fuera de cuadro y MediaPipe lo ADIVINA: ese ángulo no debe usarse.
 * Sirve para cualquier ejercicio: el ejercicio dice cuáles puntos (`getPoints`) y de qué tipo es (`kind`, `reference`).
 * @param {{getPoints: Function, kind?: string, reference?: string}} exercise
 * @param {Array} landmarks
 * @param {"left"|"right"} side
 * @param {{width:number,height:number}} frame tamaño del video en píxeles
 * @returns {{angle:number, visibility:number}} angle = NaN si falta un punto; visibility = 0 si falta un punto
 */
export function measureJoint(exercise, landmarks, side, frame = { width: 1, height: 1 }) {
  const points = exercise.getPoints(landmarks, side);
  const visibility = points.every(Boolean) ? Math.min(...points.map((p) => p.visibility ?? 1)) : 0;
  const px = toPixelSpace(points, frame.width || 1, frame.height || 1);
  const angle = exercise.kind === "segment" ? segmentAngle(px[0], px[1], exercise.reference) : calculateAngle(...px);
  return { angle, visibility };
}

/** Visibilidad mínima para fiarse de una medición (la propia escala de MediaPipe: 0 = tapado, 1 = visible). */
export const MIN_VISIBILITY = 0.5;

