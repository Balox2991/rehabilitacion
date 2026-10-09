/**
 * compensation.js
 * ------------------------------------------------------------------
 * Detección BÁSICA de compensaciones (mala forma), basada en reglas
 * explicables — no en un modelo de machine learning. Para un
 * prototipo de Fase 1 esto es apropiado y defendible: es
 * transparente, no requiere datos de entrenamiento, y cubre los
 * patrones de compensación más comunes en fisioterapia de
 * extremidades:
 *
 *   1) Inclinación de tronco: el paciente inclina el torso para
 *      "ayudarse" a alcanzar el rango de movimiento en vez de mover
 *      solo la articulación objetivo.
 *   2) Elevación de cadera/hombro: el paciente levanta la cadera (en
 *      ejercicios de rodilla) o el hombro (en ejercicios de codo)
 *      para compensar falta de movilidad real.
 *
 * Se calibra una posición de referencia al iniciar el ejercicio
 * (postura de reposo del propio paciente) y luego se compara cada
 * frame contra esa referencia — así no se depende de una postura
 * "ideal" universal, sino del punto de partida real de cada persona.
 *
 * Limitación conocida (documentada para la sustentación): con una
 * sola cámara 2D, una inclinación hacia/desde la cámara (eje Z) es
 * más difícil de detectar que una inclinación lateral. Se mitiga
 * pidiendo al paciente que se ubique de perfil o de frente según el
 * ejercicio (ver docs/FASE-1-TRACKING.md).
 */

import { LANDMARKS } from "./angleMath.js";

function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Ángulo de la línea cadera-hombro respecto a la vertical, en grados.
 * 0° = perfectamente vertical (torso erguido). En coordenadas de
 * imagen, "arriba" es -y.
 */
function trunkAngleFromVertical(midShoulder, midHip, aspect = 1) {
  if (!midShoulder || !midHip) return NaN;
  const dx = (midShoulder.x - midHip.x) * aspect; // x normalizada por el ancho, y por el alto: se lleva a la misma escala
  const dy = midShoulder.y - midHip.y; // típicamente negativo (hombro arriba de cadera)
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export class CompensationDetector {
  /**
   * @param {Object} [config]
   * @param {number} [config.trunkLeanThresholdDeg=15] - desviación de tronco tolerada respecto a la calibración
   * @param {number} [config.verticalShiftThreshold=0.05] - desplazamiento vertical tolerado (en unidades normalizadas 0-1 de la imagen)
   * @param {number} [config.aspect=1] - ancho/alto del video (640/480 ≈ 1,33). Sin esto, la inclinación del tronco se subestima.
   */
  constructor({ trunkLeanThresholdDeg = 15, verticalShiftThreshold = 0.05, aspect = 1 } = {}) {
    this.aspect = aspect;
    this.trunkLeanThresholdDeg = trunkLeanThresholdDeg;
    this.verticalShiftThreshold = verticalShiftThreshold;
    this.baseline = null;
  }

  /**
   * Guarda la postura de referencia (llamar cuando el paciente está
   * en la posición de reposo, antes de iniciar las repeticiones).
   */
  calibrate(landmarks) {
    const midShoulder = midpoint(landmarks[LANDMARKS.LEFT_SHOULDER], landmarks[LANDMARKS.RIGHT_SHOULDER]);
    const midHip = midpoint(landmarks[LANDMARKS.LEFT_HIP], landmarks[LANDMARKS.RIGHT_HIP]);
    this.baseline = {
      trunkAngle: trunkAngleFromVertical(midShoulder, midHip, this.aspect),
      shoulderY: midShoulder ? midShoulder.y : null,
      hipY: midHip ? midHip.y : null,
    };
  }

  get isCalibrated() {
    return this.baseline !== null && !Number.isNaN(this.baseline.trunkAngle);
  }

  /**
   * Evalúa un frame contra la calibración y devuelve las banderas de
   * compensación activas.
   * @param {Array} landmarks
   * @param {"knee_flexion"|"elbow_flexion"|"shoulder_flexion"} exerciseId
   * @returns {{trunkLean: boolean, hipHike: boolean, shoulderShrug: boolean, flags: string[]}}
   */
  check(landmarks, exerciseId) {
    const result = { trunkLean: false, hipHike: false, shoulderShrug: false, flags: [] };
    if (!this.isCalibrated) return result;

    const midShoulder = midpoint(landmarks[LANDMARKS.LEFT_SHOULDER], landmarks[LANDMARKS.RIGHT_SHOULDER]);
    const midHip = midpoint(landmarks[LANDMARKS.LEFT_HIP], landmarks[LANDMARKS.RIGHT_HIP]);
    const trunkAngle = trunkAngleFromVertical(midShoulder, midHip, this.aspect);

    if (!Number.isNaN(trunkAngle) && !Number.isNaN(this.baseline.trunkAngle)) {
      const delta = Math.abs(trunkAngle - this.baseline.trunkAngle);
      if (delta > this.trunkLeanThresholdDeg) {
        result.trunkLean = true;
        result.flags.push("Inclinación de tronco");
      }
    }

    if (exerciseId === "knee_flexion" && midHip && this.baseline.hipY !== null) {
      const shift = Math.abs(midHip.y - this.baseline.hipY);
      if (shift > this.verticalShiftThreshold) {
        result.hipHike = true;
        result.flags.push("Elevación de cadera");
      }
    }

    if ((exerciseId === "elbow_flexion" || exerciseId === "shoulder_flexion") && midShoulder && this.baseline.shoulderY !== null) {
      const shift = Math.abs(midShoulder.y - this.baseline.shoulderY);
      if (shift > this.verticalShiftThreshold) {
        result.shoulderShrug = true;
        result.flags.push("Elevación de hombro");
      }
    }

    return result;
  }
}
