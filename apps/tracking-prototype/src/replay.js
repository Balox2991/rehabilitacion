/**
 * replay.js
 * ------------------------------------------------------------------
 * Reproduce, SIN cámara, un registro de sesión (formato telerehab-trace/2, ver analysis.js). Sirve para:
 *   1. Comparar lo que contó el detector EN VIVO, lo que dice el análisis POSTERIOR y lo que la persona contó a mano.
 *   2. Probar otros parámetros del detector con grabaciones reales, sin repetir los ejercicios.
 * El registro contiene solo números (tiempo, ángulo, visibilidad, banderas) y el esqueleto: ningún video ni imagen.
 */
import { MIN_VISIBILITY } from "./angleMath.js";
import { TRACE_FORMAT, analyzeSession } from "./analysis.js";
import { RepCounter } from "./repCounter.js";

export function replayTrace(trace, overrides = {}) {
  if (trace?.format !== TRACE_FORMAT) throw new Error(`Formato de registro no reconocido (se esperaba ${TRACE_FORMAT}).`);
  const { meta } = trace;
  const counter = new RepCounter({ targetAngle: meta.targetAngle, restAngle: meta.restAngle, direction: meta.direction, ...overrides });
  const live = [];
  let used = 0, hidden = 0;
  trace.t.forEach((t, i) => {
    if (!(trace.vis[i] >= MIN_VISIBILITY)) { hidden++; return; }
    used++;
    if (counter.update(trace.angle[i], t).repCompleted) live.push({ t, rom: counter.lastRomAchieved, reachedTarget: counter.lastReachedTarget });
  });
  const analysis = analyzeSession(trace);
  const manual = trace.manual_count ?? null;
  return {
    live: { detected: live.length, reps: live, discarded: counter.discarded },
    offline: { detected: analysis.summary.count, reps: analysis.reps, summary: analysis.summary, suggestions: analysis.suggestions },
    samplesUsed: used,
    samplesHidden: hidden,
    seconds: analysis.duration_s,
    manualCount: manual,
    differenceLive: manual == null ? null : live.length - manual,
    differenceOffline: manual == null ? null : analysis.summary.count - manual,
  };
}
