// Arma lo que se guarda al terminar una sesión (probado en tests/sessionPayload.test.mjs).
// Ruta relativa y no el alias @engine para que las pruebas de Node puedan importarlo (igual que demos.js).
import { analyzeSession } from "../../../tracking-prototype/src/analysis.js";

export const MAX_TRACE_CHARS = 2_800_000; // el servidor acepta hasta 3 MB por sesión

// Si el registro no cabe, se sacrifica primero el esqueleto (lo más pesado); si aun así no cabe, se envía sin registro.
// Una sesión SIN registro se guarda igual: lo importante es no perder las repeticiones del paciente.
export function traceForUpload(trace, maxChars = MAX_TRACE_CHARS) {
  if (!trace) return null;
  if (JSON.stringify(trace).length <= maxChars) return trace;
  const light = { ...trace, skeleton: null };
  return JSON.stringify(light).length <= maxChars ? light : null;
}

/**
 * El dato oficial de la sesión sale del ANÁLISIS POSTERIOR del registro completo (mejor filtrado y sin retraso); el
 * conteo en vivo fue la guía del paciente. Si el análisis falla o no encuentra ninguna repetición pero en vivo sí hubo,
 * se conserva lo contado en vivo: nunca se pierde una sesión por un error del análisis.
 * @returns {{body: object, source: "posterior"|"en_vivo", analysis: object|null}}
 */
export function buildSessionPayload({ plan, snap, trace }) {
  let reps = snap.reps;
  let source = "en_vivo";
  let analysis = null;
  if (trace) {
    try {
      analysis = analyzeSession(trace, { expectedReps: plan.sets * plan.reps_per_set });
      if (analysis.reps.length > 0) {
        reps = analysis.reps.map((r) => ({ rom_achieved: r.angle, compensation_flags: r.flags }));
        source = "posterior";
      }
    } catch {
      analysis = null;
    }
  }
  const upload = traceForUpload(trace);
  return {
    body: {
      exercise_code: plan.exercise_code, side: plan.side, target_angle: plan.target_angle, plan_id: plan.plan_id,
      started_at: snap.started_at.toISOString(), ended_at: snap.ended_at.toISOString(), reps,
      ...(upload ? { trace: upload } : {}),
    },
    source,
    analysis,
  };
}
