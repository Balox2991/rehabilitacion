/**
 * coach.js
 * ------------------------------------------------------------------
 * ASISTENTE DE RECUPERACIÓN: convierte el análisis del video de una sesión + el historial del paciente + su plan en
 * recomendaciones. Puro: recibe datos y devuelve códigos con sus números; el TEXTO lo arman las pantallas (web/src/lib/coachText.js).
 *
 * Qué lo hace distinto de una lista de consejos genéricos:
 *   1. EXPLICABLE: cada recomendación lleva los números de ESTE paciente que la motivaron (el «por qué»).
 *   2. HONESTO CON EL MARGEN DE ERROR: la cámara mide con un error de unos 3 a 5° (Russo 2026, voluntarios sanos), así que no
 *      celebra ni alarma por cambios menores a `noiseFloorDeg`.
 *   3. HUMANO EN EL CIRCUITO: al paciente le da orientación y le dice cuándo avisar a su fisioterapeuta; al FISIOTERAPEUTA
 *      le PROPONE ajustes del plan (meta, repeticiones) con su justificación, y solo se aplican si él los aprueba.
 *   4. CON RESPALDO: solo cita estudios verificados de la plataforma, y únicamente donde el estudio dice algo del tema
 *      (adherencia, distancia a la cámara, error de la medición, metas individuales).
 *
 * No es un sistema médico ni da indicaciones clínicas nuevas: no sugiere cargas, rangos ni plazos que el equipo tratante
 * no haya definido. Es un sistema de reglas (no un modelo generativo): determinista, probado y auditable. Todos los umbrales
 * están en COACH y son ORIENTATIVOS, no criterio clínico.
 */

export const COACH = {
  noiseFloorDeg: 4, // error típico de una cámara de teléfono con MediaPipe (≈3–5°): no se interpretan cambios menores
  trendWindow: 6, // sesiones recientes que se miran
  minSessionsForTrend: 3,
  plateauSessions: 4, // sesiones seguidas sin ganar más que el margen de error
  reachedStreak: 3, // sesiones seguidas en la meta para proponer subirla
  targetToleranceDeg: 8, // «llegó a la meta» (igual que analysis.js)
  raiseTargetStepDeg: 5, // cuánto se propone subir la meta (en grados de flexión)
  regressionDropDeg: 8, // caída frente a las sesiones anteriores (por encima del margen de error)
  recurrent: { window: 3, atLeast: 2 }, // «se repite»: en al menos 2 de las últimas 3 sesiones
  fatigueDropPct: 15,
  flaggedPct: 30,
  reduceRepsBy: 2,
  minRepsPerSet: 5,
  adherenceWindowDays: 14,
  lowAdherence: 0.5, // menos de la mitad de las sesiones del plan en las últimas 2 semanas
  minPlanAgeDays: 14, // antes de eso no se juzga la adherencia
  maxHighlights: 2,
  maxFocus: 2,
  maxCare: 1,
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x) => Math.round(x * 10) / 10;

/** Pendiente robusta (Theil–Sen): mediana de las pendientes de todos los pares. Un día excepcional no la tuerce. */
export function theilSen(ys) {
  const slopes = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) slopes.push((ys[j] - ys[i]) / (j - i));
  return slopes.length ? median(slopes) : 0;
}

/**
 * Tendencia del mejor movimiento (grados de flexión) a lo largo de las sesiones del plan, de la más antigua a la más nueva.
 * @param {number[]} bests mejor flexión de cada sesión
 */
export function trendOf(bests, targetFlex, { noise = COACH.noiseFloorDeg, tol = COACH.targetToleranceDeg } = {}) {
  const w = bests.filter(Number.isFinite).slice(-COACH.trendWindow);
  const n = w.length;
  const last = n ? w[n - 1] : null;
  const edge = Math.min(3, n);
  const gain = n >= 2 ? median(w.slice(-edge)) - median(w.slice(0, edge)) : 0;
  const slope = n >= 2 ? theilSen(w) : 0;
  const last4 = w.slice(-COACH.plateauSessions);
  const previous = w.slice(-4, -1);
  let reachedStreak = 0;
  for (let i = bests.length - 1; i >= 0 && bests[i] >= targetFlex - tol; i--) reachedStreak++;
  return {
    sessions: n,
    first: n ? w[0] : null,
    last,
    best_ever: bests.length ? Math.max(...bests.filter(Number.isFinite)) : null,
    slope: round1(slope),
    gain: round1(gain),
    improving: n >= COACH.minSessionsForTrend && gain >= noise && slope > 0,
    plateau: n >= COACH.plateauSessions && Math.max(...last4) - Math.min(...last4) <= noise && median(last4) < targetFlex - tol,
    regression: previous.length >= 2 && last < median(previous) - COACH.regressionDropDeg,
    reached_streak: reachedStreak,
    remaining: last == null ? null : Math.max(0, Math.round(targetFlex - last)),
  };
}

const recurrent = (entries, pick) => entries.slice(-COACH.recurrent.window).filter(pick).length >= COACH.recurrent.atLeast;

/**
 * @param {object} input
 * @param {{direction:string,rest:number}} input.exercise  `rest` = ángulo de reposo
 * @param {{plan_id:number,target_angle:number,sets:number,reps_per_set:number,times_per_week:number}} input.plan
 * @param {string|null} input.phase etapa de recuperación (proteccion | movilidad | fortalecimiento | funcional)
 * @param {Array<{flexion:number,reps:number,flagged_pct:number|null,drop_pct:number|null,fast:boolean|null,low_visibility:boolean|null}>} input.history
 *        sesiones del plan, de la más antigua a la más nueva, INCLUIDA la que se está evaluando (la última)
 * @param {object|null} input.current análisis completo de esa última sesión (analysis.js) o null si no lo tiene
 * @param {number} input.recentSessions sesiones del plan en la ventana de adherencia
 * @param {number} input.planAgeDays días desde que se prescribió el plan
 */
export function coach({ exercise, plan, phase = null, history, current = null, recentSessions = 0, planAgeDays = 0 }) {
  const toFlex = (a) => (exercise.direction === "decreasing" ? 180 - a : a);
  const targetFlex = toFlex(plan.target_angle);
  const bests = history.map((h) => h.flexion);
  const trend = trendOf(bests, targetFlex);
  const now = history.length ? history[history.length - 1] : null;
  const before = bests.slice(0, -1).filter(Number.isFinite);
  const noise = COACH.noiseFloorDeg;
  const tol = COACH.targetToleranceDeg;
  const sug = (code) => current?.suggestions?.find((s) => s.code === code) ?? null;

  const highlights = [];
  const focus = [];
  const care = [];
  const advise = [];
  const add = (list, code, data = {}, evidence = [], extra = {}) => list.push({ code, data, evidence, ...extra });

  // ---------------------------------------------------------------- lo que ya se sabe de HOY y del historial
  const expected = (plan.times_per_week * COACH.adherenceWindowDays) / 7;
  const adherence = expected > 0 ? Math.min(1, recentSessions / expected) : null;
  const lowAdherence = planAgeDays >= COACH.minPlanAgeDays && adherence != null && adherence < COACH.lowAdherence;

  // ---------------------------------------------------------------- para el PACIENTE
  if (now) {
    if (now.flexion >= targetFlex - tol) add(highlights, "reached_target", { best: Math.round(now.flexion), target: Math.round(targetFlex) });
    else if (history.length === 1) add(highlights, "first_record", { best: Math.round(now.flexion), target: Math.round(targetFlex) });
    else if (before.length && now.flexion >= Math.max(...before) + noise) add(highlights, "new_best", { best: Math.round(now.flexion), previous: Math.round(Math.max(...before)) });
    const reached = highlights.some((h) => h.code === "reached_target");
    // «Te faltan N°» va antes que «vienes mejorando»: con el tope de dos mensajes, lo que habla de la meta es lo más útil.
    if (!reached && trend.remaining != null && trend.remaining <= 10 && trend.remaining > 0 && trend.improving) {
      add(highlights, "close_to_target", { remaining: trend.remaining, target: Math.round(targetFlex) });
    }
    if (trend.improving && !reached) {
      add(highlights, "improving", { gain: Math.round(trend.gain), sessions: trend.sessions, from: Math.round(trend.first), to: Math.round(trend.last) }, ["russo2026"]);
    }
  }

  if (sug("fast_up") || sug("fast_down")) add(focus, "slow_down", { up: sug("fast_up")?.data.seconds ?? null, down: sug("fast_down")?.data.seconds ?? null });
  if (sug("short_hold")) add(focus, "hold_longer", sug("short_hold").data);
  if (sug("fatigue")) add(focus, "rest_between", sug("fatigue").data);
  if (sug("posture")) add(focus, "posture_care", sug("posture").data, [], { action: { type: "library" } });
  if (sug("low_visibility")) add(focus, "camera_setup", sug("low_visibility").data, ["barzegar2024"], { action: { type: "setup" } });
  if (sug("irregular_rhythm")) add(focus, "steady_rhythm", sug("irregular_rhythm").data);

  if (trend.regression) add(care, "regression", { last: Math.round(trend.last), usual: Math.round(median(bests.slice(-4, -1))) }, ["russo2026"], { action: { type: "pain" } });
  else if (trend.plateau) add(care, "plateau", { sessions: COACH.plateauSessions, level: Math.round(trend.last) }, ["russo2026"], { action: { type: "contact" } });
  if (lowAdherence) add(care, "low_adherence", { done: recentSessions, expected: Math.round(expected) }, ["jack2010"], { action: { type: "habit" } });
  if (recurrent(history, (h) => (h.drop_pct ?? 0) >= COACH.fatigueDropPct)) add(care, "repeated_fatigue", { of: Math.min(COACH.recurrent.window, history.length) }, [], { action: { type: "contact" } });

  // ---------------------------------------------------------------- para el FISIOTERAPEUTA (propuestas que él aprueba)
  const fromAngle = plan.target_angle;
  const moveAngle = (deltaFlex) => (exercise.direction === "decreasing" ? fromAngle - deltaFlex : fromAngle + deltaFlex);
  if (trend.reached_streak >= COACH.reachedStreak) {
    const nextAngle = Math.max(0, Math.min(180, moveAngle(COACH.raiseTargetStepDeg)));
    const protect = phase === "proteccion";
    advise.push({
      code: "raise_target", severity: "info", evidence: ["soucie2011"],
      data: { streak: trend.reached_streak, target: Math.round(targetFlex), next: Math.round(toFlex(nextAngle)), phase, protect },
      // En la etapa de protección no se propone mover la meta: la decisión es clínica y más delicada.
      proposal: protect || nextAngle === fromAngle ? null : { plan_id: plan.plan_id, field: "target_angle", from: fromAngle, value: nextAngle },
    });
  }
  if (recurrent(history, (h) => (h.drop_pct ?? 0) >= COACH.fatigueDropPct)) {
    const reps = Math.max(COACH.minRepsPerSet, plan.reps_per_set - COACH.reduceRepsBy);
    advise.push({
      code: "reduce_volume", severity: "warn", evidence: [],
      data: { of: COACH.recurrent.window, drop_pct: now?.drop_pct ?? null, reps_per_set: plan.reps_per_set, next: reps },
      proposal: reps < plan.reps_per_set ? { plan_id: plan.plan_id, field: "reps_per_set", from: plan.reps_per_set, value: reps } : null,
    });
  }
  if (trend.plateau) advise.push({ code: "plateau_review", severity: "warn", evidence: ["russo2026"], data: { sessions: COACH.plateauSessions, level: Math.round(trend.last), target: Math.round(targetFlex), noise }, proposal: null });
  if (trend.regression) advise.push({ code: "regression_review", severity: "warn", evidence: ["russo2026"], data: { last: Math.round(trend.last), usual: Math.round(median(bests.slice(-4, -1))), drop: COACH.regressionDropDeg }, proposal: null });
  if (lowAdherence) advise.push({ code: "low_adherence", severity: "warn", evidence: ["jack2010"], data: { done: recentSessions, expected: Math.round(expected), days: COACH.adherenceWindowDays }, proposal: null });
  if (recurrent(history, (h) => (h.flagged_pct ?? 0) >= COACH.flaggedPct)) advise.push({ code: "posture_recurrent", severity: "warn", evidence: [], data: { of: COACH.recurrent.window }, proposal: null });
  if (recurrent(history, (h) => h.low_visibility === true)) advise.push({ code: "camera_recurrent", severity: "info", evidence: ["barzegar2024"], data: { of: COACH.recurrent.window }, proposal: null });
  if (recurrent(history, (h) => h.fast === true)) advise.push({ code: "tempo_recurrent", severity: "info", evidence: [], data: { of: COACH.recurrent.window }, proposal: null });

  return {
    trend,
    adherence: adherence == null ? null : Math.round(adherence * 100) / 100,
    patient: {
      highlights: highlights.slice(0, COACH.maxHighlights),
      focus: focus.slice(0, COACH.maxFocus),
      care: care.slice(0, COACH.maxCare),
    },
    therapist: advise,
  };
}

/** Códigos que puede producir el asistente (las pantallas deben tener texto para todos; hay una prueba que lo exige). */
export const COACH_CODES = {
  patient: ["reached_target", "first_record", "new_best", "improving", "close_to_target", "slow_down", "hold_longer", "rest_between", "posture_care", "camera_setup", "steady_rhythm", "regression", "plateau", "low_adherence", "repeated_fatigue"],
  therapist: ["raise_target", "reduce_volume", "plateau_review", "regression_review", "low_adherence", "posture_recurrent", "camera_recurrent", "tempo_recurrent"],
};
