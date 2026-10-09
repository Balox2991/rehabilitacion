// Modelo del «muñeco» que reproduce una sesión (probado en tests/replayModel.test.mjs). Puro: recibe el registro
// (telerehab-trace/2) y su análisis, y responde «¿cómo estaba el cuerpo en el milisegundo X?».
// Rutas relativas (no el alias @engine) para que Node pueda importarlo en las pruebas.
import { MIN_VISIBILITY } from "../../../tracking-prototype/src/angleMath.js";
import { SPEC_BY_CODE, measuredPointNames } from "../../../tracking-prototype/src/exerciseSpecs.js";
import { medianCentered, zeroPhaseOneEuro } from "../../../tracking-prototype/src/signalFilter.js";

// Segmentos del cuerpo que se dibujan.
export const LIMBS = [
  ["left_shoulder", "right_shoulder"], ["left_hip", "right_hip"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

// Los puntos que se miden en cada ejercicio, tomados de su especificación: tres si es el ángulo de una articulación (el
// vértice es el del medio) y dos si es un segmento (elevación de pierna).
export const measuredJoints = (exercise, side) => {
  const spec = SPEC_BY_CODE[exercise];
  return spec ? measuredPointNames(spec.measure).map((j) => `${side}_${j}`) : [];
};

/** Índice de la última lectura con tiempo ≤ pos (0 si pos es anterior a la primera). Búsqueda binaria. */
export function indexAt(times, pos) {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || pos <= times[0]) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function buildReplayModel(trace, analysis) {
  const { t, angle, vis, meta, skeleton } = trace;
  const direction = meta?.direction ?? "decreasing";
  const toFlex = (a) => (direction === "decreasing" ? 180 - a : a);
  // Ángulo suavizado solo sobre lecturas confiables, para que el número del replay no tiemble.
  const validIdx = t.map((_, i) => i).filter((i) => vis[i] >= MIN_VISIBILITY && Number.isFinite(angle[i]));
  const smooth =
    validIdx.length > 5
      ? zeroPhaseOneEuro(validIdx.map((i) => t[i]), medianCentered(validIdx.map((i) => toFlex(angle[i])), 5), { minCutoff: 2 })
      : validIdx.map((i) => toFlex(angle[i]));
  const flexion = new Array(t.length).fill(null);
  validIdx.forEach((i, k) => { flexion[i] = smooth[k]; });
  const t0 = t.length ? t[0] : 0;
  return {
    times: t, vis, flexion, t0,
    duration: t.length ? t[t.length - 1] - t0 : 0,
    width: meta?.width ?? 640, height: meta?.height ?? 480,
    joints: skeleton?.joints ?? [], stride: skeleton?.stride ?? 1, frames: skeleton?.frames ?? [],
    measured: measuredJoints(meta?.exercise, meta?.side),
    reps: (analysis?.reps ?? []).map((r) => ({ n: r.n, from: r.t_start_s * 1000 + t0, peak: r.t_peak_s * 1000 + t0, to: r.t_end_s * 1000 + t0, flexion: r.flexion })),
  };
}

/** Repetición en curso en el instante `pos` (ms absolutos del registro), o null. */
export function repAt(model, pos) {
  return model.reps.find((r) => pos >= r.from && pos <= r.to) ?? null;
}

/** Cuerpo en el instante `pos`: puntos en coordenadas de la vista, si se veía bien, flexión medida y repetición activa. */
export function poseAt(model, pos) {
  const i = indexAt(model.times, pos);
  const f = Math.min(model.frames.length - 1, Math.floor(i / model.stride));
  const frame = f >= 0 ? model.frames[f] : null;
  const points = {};
  if (frame) model.joints.forEach((name, k) => { points[name] = { x: (frame[k * 2] / 1000) * model.width, y: (frame[k * 2 + 1] / 1000) * model.height }; });
  let shown = null;
  for (let k = i; k >= 0 && model.times[i] - model.times[k] <= 500; k--) {
    if (model.flexion[k] != null) { shown = model.flexion[k]; break; }
  }
  const rep = repAt(model, pos);
  return { points, hasSkeleton: Boolean(frame), visible: model.vis[i] >= MIN_VISIBILITY, flexion: shown, rep: rep?.n ?? null, index: i };
}
