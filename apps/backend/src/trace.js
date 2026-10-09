// Validación del registro de una sesión (formato telerehab-trace/2). Función pura: recibe lo que llegó del cliente y
// devuelve { trace } normalizado o { error } con el primer problema. Todo lo que llega del cliente es no confiable:
// se comprueban tipos, rangos, tamaños y que los arreglos paralelos tengan el mismo largo.

import { SKELETON_JOINTS, TRACE_FORMAT } from "./engine.js";

export { SKELETON_JOINTS }; // la lista vive en el motor (traceRecorder.js): una sola fuente para el grabador y el validador
export const LIMITS = { samples: 40000, skeletonFrames: 20000, flagEvents: 2000, flagNames: 5, flagLength: 40 };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const fail = (error) => ({ error: `trace: ${error}` });

export function parseTrace(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("debe ser un objeto");
  if (raw.format !== TRACE_FORMAT) return fail(`format debe ser '${TRACE_FORMAT}'`);
  const { t, angle, vis } = raw;
  if (![t, angle, vis].every(Array.isArray)) return fail("t, angle y vis deben ser listas");
  const n = t.length;
  if (angle.length !== n || vis.length !== n) return fail("t, angle y vis deben tener el mismo largo");
  if (n > LIMITS.samples) return fail(`máximo ${LIMITS.samples} lecturas`);
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (!isInt(t[i]) || t[i] < 0 || t[i] < prev) return fail(`t[${i}] debe ser un entero en milisegundos, no decreciente`);
    prev = t[i];
    if (!isNum(angle[i]) || angle[i] < 0 || angle[i] > 180) return fail(`angle[${i}] debe estar entre 0 y 180`);
    if (!isNum(vis[i]) || vis[i] < 0 || vis[i] > 1) return fail(`vis[${i}] debe estar entre 0 y 1`);
  }

  let skeleton = null;
  if (raw.skeleton != null) {
    const { joints, stride, frames } = raw.skeleton;
    if (!Array.isArray(joints) || joints.length < 1 || new Set(joints).size !== joints.length || !joints.every((j) => SKELETON_JOINTS.includes(j))) return fail("skeleton.joints inválido");
    if (!isInt(stride) || stride < 1 || stride > 10) return fail("skeleton.stride debe ser un entero entre 1 y 10");
    if (!Array.isArray(frames) || frames.length > LIMITS.skeletonFrames || frames.length > Math.ceil(n / stride) + 1) return fail("skeleton.frames inválido o demasiado largo");
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (!Array.isArray(f) || f.length !== joints.length * 2 || !f.every((v) => isNum(v) && v >= -1000 && v <= 2000)) return fail(`skeleton.frames[${i}] inválido`);
    }
    skeleton = { joints, stride, frames };
  }

  let flags = [];
  if (raw.flags != null) {
    if (!Array.isArray(raw.flags) || raw.flags.length > LIMITS.flagEvents) return fail("flags inválido o demasiado largo");
    for (const [i, e] of raw.flags.entries()) {
      const ok = Array.isArray(e) && e.length === 2 && isInt(e[0]) && e[0] >= 0 && Array.isArray(e[1]) && e[1].length <= LIMITS.flagNames
        && e[1].every((s) => typeof s === "string" && s.length > 0 && s.length <= LIMITS.flagLength);
      if (!ok) return fail(`flags[${i}] debe ser [milisegundos, [textos]]`);
    }
    flags = raw.flags;
  }

  const m = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const meta = {};
  for (const k of ["width", "height"]) if (isInt(m[k]) && m[k] > 0 && m[k] <= 8000) meta[k] = m[k];
  if (typeof m.model === "string" && m.model.length <= 16) meta.model = m.model;
  if (typeof m.startedAt === "string" && m.startedAt.length <= 40) meta.startedAt = m.startedAt;

  return { trace: { format: TRACE_FORMAT, meta, t, angle, vis, skeleton, flags } };
}
