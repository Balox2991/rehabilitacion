/**
 * poseTracker.js
 * ------------------------------------------------------------------
 * Envoltorio delgado sobre MediaPipe Tasks Vision (PoseLandmarker).
 * Aísla el resto de la app de los detalles de inicialización del
 * modelo, para que app.js solo tenga que llamar create() y luego
 * detect(videoEl, timestampMs).
 *
 * DECISIÓN TÉCNICA (para la sustentación):
 * Se eligió MediaPipe Tasks Vision — la sucesora oficial de
 * @mediapipe/pose — porque corre 100% en el navegador del paciente
 * (WASM + aceleración GPU vía WebGL cuando está disponible):
 *   - No hay envío de video a ningún servidor -> más simple y mejor
 *     para la privacidad de datos de salud del paciente.
 *   - Baja latencia: la inferencia es local, no hay ida y vuelta de
 *     red por cada frame (crítico para "tiempo real").
 *   - Sin costo de cómputo en un backend propio.
 *   - Es la misma librería, en su versión mantenida activamente por
 *     Google, que ya tenías contemplada en el alcance original.
 *
 * MODELO: desde la corrección de precisión se usa "full" por defecto (los puntos de rodilla, tobillo y muñeca son más
 * estables que con "lite"; cuesta unos 3 MB más de descarga y algo más de GPU). Si "full" no carga, se cae a "lite".
 * "heavy" existe pero no suele compensar para ejercicios de una sola articulación.
 */

const TASKS_VISION_VERSION = "0.10.14";
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const modelUrl = (variant) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/latest/pose_landmarker_${variant}.task`;

let visionModulePromise = null;
function loadVisionModule() {
  if (!visionModulePromise) {
    // Import dinámico desde CDN: se resuelve en el navegador del
    // paciente/fisio en tiempo de ejecución, no durante el desarrollo
    // en este entorno (por eso no requiere npm install aquí).
    visionModulePromise = import(
      /* webpackIgnore: true */ /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`
    );
  }
  return visionModulePromise;
}

export class PoseTracker {
  constructor(landmarker, DrawingUtilsClass, connections) {
    this.landmarker = landmarker;
    this.DrawingUtils = DrawingUtilsClass;
    this.connections = connections;
    this._lastVideoTime = -1;
  }

  /** @param {{model?: "lite"|"full"|"heavy"}} [options] */
  static async create({ model = "full" } = {}) {
    const { FilesetResolver, PoseLandmarker, DrawingUtils } = await loadVisionModule();
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    const build = (variant) =>
      PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: modelUrl(variant), delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        // Umbrales más exigentes que los de fábrica (0,5): con menos confianza el modelo «adivina» articulaciones tapadas.
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    let landmarker;
    let variant = model;
    try {
      landmarker = await build(model);
    } catch (err) {
      if (model === "lite") throw err;
      variant = "lite"; // sin red hacia el modelo grande o sin memoria de GPU: el liviano siempre es mejor que nada
      landmarker = await build("lite");
    }
    const tracker = new PoseTracker(landmarker, DrawingUtils, PoseLandmarker.POSE_CONNECTIONS);
    tracker.modelVariant = variant;
    return tracker;
  }

  /**
   * Corre la detección sobre el frame actual del <video>. Devuelve:
   *   - los 33 landmarks normalizados (x,y,z en [0,1] aprox, visibility) del primer cuerpo detectado;
   *   - null si el frame es nuevo pero no se detectó a nadie;
   *   - undefined si el video todavía no tiene un frame nuevo (requestAnimationFrame corre más rápido
   *     que la cámara). El llamador debe IGNORAR ese caso, no tratarlo como "sin persona": si no, el
   *     esqueleto y el ángulo parpadean en cada frame repetido.
   */
  detect(videoEl, timestampMs) {
    if (videoEl.currentTime === this._lastVideoTime) return undefined;
    this._lastVideoTime = videoEl.currentTime;

    const result = this.landmarker.detectForVideo(videoEl, timestampMs);
    if (!result || !result.landmarks || result.landmarks.length === 0) return null;
    return result.landmarks[0];
  }

  /** Dibuja el esqueleto detectado sobre un canvas 2D superpuesto al video. */
  draw(ctx, landmarks) {
    const drawingUtils = new this.DrawingUtils(ctx);
    drawingUtils.drawConnectors(landmarks, this.connections, { color: "#4ade80", lineWidth: 3 });
    drawingUtils.drawLandmarks(landmarks, { color: "#22d3ee", radius: 3 });
  }

  close() {
    this.landmarker?.close();
  }
}
