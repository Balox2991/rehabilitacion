/**
 * traceRecorder.js
 * ------------------------------------------------------------------
 * Arma el REGISTRO de una sesión (formato telerehab-trace/2) a medida que llegan los cuadros de la cámara. Puro: recibe
 * números y devuelve un objeto; no toca cámara, DOM ni red.
 *
 * Qué guarda (y qué NO): tiempo, ángulo medido, visibilidad, cambios en las alertas de postura y el «esqueleto» (12
 * puntos del cuerpo en coordenadas normalizadas). NUNCA video ni imágenes: con el esqueleto se puede reproducir el
 * movimiento como un muñeco, sin que se vea a la persona.
 */
import { LANDMARKS } from "./angleMath.js";
import { TRACE_FORMAT } from "./analysis.js";

// Los 12 puntos que se guardan. Mismo orden en el registro y en el servidor (que valida contra esta lista).
export const SKELETON_POINTS = [
  ["left_shoulder", LANDMARKS.LEFT_SHOULDER], ["right_shoulder", LANDMARKS.RIGHT_SHOULDER],
  ["left_elbow", LANDMARKS.LEFT_ELBOW], ["right_elbow", LANDMARKS.RIGHT_ELBOW],
  ["left_wrist", LANDMARKS.LEFT_WRIST], ["right_wrist", LANDMARKS.RIGHT_WRIST],
  ["left_hip", LANDMARKS.LEFT_HIP], ["right_hip", LANDMARKS.RIGHT_HIP],
  ["left_knee", LANDMARKS.LEFT_KNEE], ["right_knee", LANDMARKS.RIGHT_KNEE],
  ["left_ankle", LANDMARKS.LEFT_ANKLE], ["right_ankle", LANDMARKS.RIGHT_ANKLE],
];
export const SKELETON_JOINTS = SKELETON_POINTS.map(([name]) => name);

/** ~12 min a 30 fps. Una sesión normal dura 2–5 minutos; el tope evita registros enormes si alguien deja la cámara encendida. */
export const DEFAULT_MAX_SAMPLES = 22000;

export class TraceRecorder {
  /**
   * @param {object} meta { exercise, side, targetAngle, restAngle, direction, model, width, height, startedAt }
   * @param {object} [options] { maxSamples, skeletonEvery: guardar un cuadro del esqueleto cada N lecturas (2 ≈ 15 por segundo) }
   */
  constructor(meta, { maxSamples = DEFAULT_MAX_SAMPLES, skeletonEvery = 2 } = {}) {
    this.meta = meta;
    this.maxSamples = maxSamples;
    this.skeletonEvery = skeletonEvery;
    this.reset();
  }

  reset() {
    this.origin = null;
    this.t = [];
    this.angle = [];
    this.vis = [];
    this.frames = [];
    this.flags = [];
    this._flagsKey = null;
  }

  get length() { return this.t.length; }
  get full() { return this.t.length >= this.maxSamples; }

  _rel(tMs) {
    if (this.origin === null) this.origin = tMs;
    return Math.round(tMs - this.origin);
  }

  /** Una lectura de la articulación. `landmarks` (opcional) alimenta el esqueleto. Devuelve false si se ignoró. */
  addSample(tMs, angle, visibility, landmarks = null) {
    if (this.full || !Number.isFinite(angle) || !Number.isFinite(tMs)) return false;
    const rel = this._rel(tMs);
    if (this.t.length && rel < this.t[this.t.length - 1]) return false; // reloj atrasado: se ignora
    const index = this.t.length;
    this.t.push(rel);
    this.angle.push(Math.round(angle * 10) / 10);
    this.vis.push(Math.round(Math.min(1, Math.max(0, visibility ?? 0)) * 100) / 100);
    if (landmarks && index % this.skeletonEvery === 0) {
      const frame = [];
      for (const [, id] of SKELETON_POINTS) {
        const p = landmarks[id];
        frame.push(p ? Math.round(p.x * 1000) : 0, p ? Math.round(p.y * 1000) : 0);
      }
      this.frames.push(frame);
    } else if (!landmarks && index % this.skeletonEvery === 0) {
      this.frames.push(this.frames.length ? this.frames[this.frames.length - 1] : new Array(SKELETON_POINTS.length * 2).fill(0));
    }
    return true;
  }

  /** Cambio en las alertas de postura activas (solo se anota cuando cambian). */
  setFlags(tMs, flags) {
    const key = flags.join("|");
    if (key === this._flagsKey) return;
    this._flagsKey = key;
    this.flags.push([Math.max(0, this._rel(tMs)), [...flags]]);
  }

  build(extraMeta = {}) {
    return {
      format: TRACE_FORMAT,
      meta: { ...this.meta, ...extraMeta },
      t: this.t,
      angle: this.angle,
      vis: this.vis,
      skeleton: { joints: SKELETON_JOINTS, stride: this.skeletonEvery, frames: this.frames },
      flags: this.flags,
    };
  }
}
