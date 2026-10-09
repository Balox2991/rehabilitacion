/**
 * videoPass.js
 * ------------------------------------------------------------------
 * Recorre una grabación cuadro por cuadro y arma el REGISTRO de la sesión (formato telerehab-trace/2), igual que lo hace
 * la cámara en vivo, para analizarlo después con analysis.js. Es la parte pura del análisis de un VIDEO SUBIDO: no sabe
 * de <video> ni de MediaPipe; recibe una función `getLandmarks(tMs)` que le entrega el cuerpo detectado en ese instante.
 * El envoltorio con el navegador está en apps/web/src/tracking/videoAnalysis.js.
 *
 * Privacidad: el video se procesa en el navegador de la persona; aquí solo pasan números y puntos del cuerpo.
 */
import { MIN_VISIBILITY, measureJoint } from "./angleMath.js";
import { CompensationDetector } from "./compensation.js";
import { TraceRecorder } from "./traceRecorder.js";

export const DEFAULT_STEP_MS = 66; // ~15 cuadros por segundo: suficiente para repeticiones y la mitad del costo de 30

/**
 * @param {object} o
 * @param {number} o.durationMs duración del video
 * @param {(tMs:number)=>Promise<Array|null>|Array|null} o.getLandmarks cuerpo detectado en ese instante (null = no se ve a nadie)
 * @param {{id:string,getPoints:Function,restAngleApprox:number,direction:string}} o.exercise
 * @param {"left"|"right"} o.side   @param {number} o.targetAngle
 * @param {{width:number,height:number}} o.frame tamaño del video
 * @param {number} [o.stepMs]   @param {(fraction:number)=>void} [o.onProgress]   @param {()=>boolean} [o.shouldStop]
 * @param {object} [o.meta] datos extra para el registro (modelo, fecha de inicio…)
 * @returns {Promise<{cancelled:boolean, trace?:object, seen:number, total:number}>}
 */
export async function runPosePass({ durationMs, getLandmarks, exercise, side, targetAngle, frame, stepMs = DEFAULT_STEP_MS, onProgress, shouldStop, meta = {} }) {
  const recorder = new TraceRecorder({
    exercise: exercise.id, side, targetAngle, restAngle: exercise.restAngleApprox, direction: exercise.direction,
    width: frame.width, height: frame.height, ...meta,
  });
  const detector = new CompensationDetector({ aspect: frame.width / frame.height });
  let calibrated = false;
  let seen = 0;
  let total = 0;

  for (let t = 0; t <= durationMs; t += stepMs) {
    if (shouldStop?.()) return { cancelled: true, seen, total };
    const landmarks = await getLandmarks(t);
    total++;
    if (landmarks) {
      const { angle, visibility } = measureJoint(exercise, landmarks, side, frame);
      if (Number.isFinite(angle)) {
        recorder.addSample(t, angle, visibility, landmarks);
        if (visibility >= MIN_VISIBILITY) seen++;
      }
      // La postura de referencia es la del primer cuadro con la persona: se supone que el video empieza en reposo.
      if (!calibrated) { detector.calibrate(landmarks); calibrated = true; }
      recorder.setFlags(t, detector.check(landmarks, exercise.id).flags);
    }
    onProgress?.(Math.min(1, t / Math.max(1, durationMs)));
  }
  onProgress?.(1);
  return { cancelled: false, trace: recorder.build(), seen, total };
}
