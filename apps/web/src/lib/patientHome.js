// Lógica pura de las pantallas del paciente (probada en tests/patientHome.test.mjs).
// Todas reciben datos ya calculados por el servidor (GET /patients/:id/overview); aquí solo se decide qué mostrar.

// Sesiones que le faltan a un ejercicio esta semana (nunca negativo si hizo de más).
export const sessionsLeft = (plan) => Math.max(0, plan.times_per_week - plan.done_7d);

// El ejercicio al que más le falta, en proporción a lo que se le pidió. Si hay empate gana el primero del plan
// (el orden en que lo asignó el fisioterapeuta). `skipPlanId` sirve para «el siguiente» después de terminar uno.
export function nextStep(plans, skipPlanId = null) {
  let best = null;
  let bestGap = 0;
  for (const p of plans) {
    if (p.plan_id === skipPlanId) continue;
    const gap = p.times_per_week > 0 ? sessionsLeft(p) / p.times_per_week : 0;
    if (gap > bestGap) { best = p; bestGap = gap; }
  }
  return best;
}

// Qué pantalla de «Hoy» corresponde: sin plan, semana completa o algo pendiente.
export function homeState(plans) {
  if (!plans.length) return "sin_plan";
  return nextStep(plans) ? "pendiente" : "semana_completa";
}

// Sesiones de la semana hechas / pedidas. Lo hecho de más no se cuenta (evita mostrar «5/4»).
export function weekTotals(plans) {
  return plans.reduce(
    (t, p) => ({ done: t.done + Math.min(p.done_7d, p.times_per_week), planned: t.planned + p.times_per_week }),
    { done: 0, planned: 0 }
  );
}

// ¿Hizo alguna sesión hoy? `days` = last_7_days del servidor (el último elemento es hoy, en hora local).
export const doneToday = (days) => (days?.length ? days[days.length - 1].sessions > 0 : false);

// Recorrido de un ejercicio: de dónde partió, dónde está y a dónde va. Todo en grados de flexión.
// `start` es la mejor repetición de su primera sesión; sin sesiones no hay recorrido que contar.
export function journey(plan) {
  const start = plan.history?.length ? plan.history[0].flexion : null;
  const now = plan.latest_flexion ?? null;
  const target = plan.target_flexion;
  return {
    start,
    now,
    target,
    pct: plan.progress_pct ?? null,
    remaining: now == null ? null : Math.max(0, Math.round(target - now)),
  };
}

// Promedio del avance de todos los ejercicios con datos.
export function averageProgress(plans) {
  const v = plans.map((p) => p.progress_pct).filter((x) => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

// Mensaje de ánimo según el avance. Honesto: no promete resultados ni compara con otras personas.
export function progressMessage(pct) {
  if (pct == null) return "Cuando hagas tu primera sesión verás aquí cómo avanzas.";
  if (pct >= 100) return "Alcanzaste tu meta de movimiento. Tu fisioterapeuta definirá los siguientes pasos.";
  if (pct >= 75) return "Estás muy cerca de tu meta. Sigue con la misma constancia.";
  if (pct >= 40) return "Vas por buen camino. Cada sesión suma.";
  return "Estás empezando. Lo que más ayuda es la constancia, no la prisa.";
}

// Dónde va el paciente dentro de una sesión: serie y repetición actuales, según el total de repeticiones hechas.
export function setProgress(reps, sets, repsPerSet) {
  const total = sets * repsPerSet;
  if (reps >= total) return { set: sets, repInSet: repsPerSet, total, complete: true };
  return { set: Math.floor(reps / repsPerSet) + 1, repInSet: reps % repsPerSet, total, complete: false };
}

// Mejor avance histórico de un ejercicio (0–100), a partir de su MEJOR repetición de todas las sesiones.
// Se usa para los logros: a diferencia del avance «de hoy», no baja si un día se movió menos, así un logro ganado no se pierde.
export function bestProgress(plan) {
  const flexions = (plan.history ?? []).map((h) => h.flexion).filter((f) => f != null);
  if (!flexions.length) return null;
  const rest = plan.rest_flexion ?? 0;
  const span = plan.target_flexion - rest;
  if (!(span > 0)) return null;
  return Math.max(0, Math.min(100, Math.round(((Math.max(...flexions) - rest) / span) * 100)));
}

// Logros del paciente. Solo se basan en datos acumulados (nunca en la racha actual, que sí puede romperse).
// Cada uno trae `current` y `target` para mostrar «7 de 10» mientras no se gane.
export function achievements({ totals, plans }) {
  const bests = plans.map(bestProgress).filter((v) => v != null);
  const best = bests.length ? Math.max(...bests) : 0;
  const sessions = totals?.sessions ?? 0;
  const reps = totals?.reps ?? 0;
  const make = (id, icon, title, text, current, target) => ({ id, icon, title, text, current: Math.min(current, target), target, earned: current >= target });
  return [
    make("first_session", "star", "Primer paso", "Hiciste tu primera sesión", sessions, 1),
    make("sessions_10", "calendar", "Constancia", "10 sesiones completadas", sessions, 10),
    make("sessions_25", "calendar", "Hábito", "25 sesiones completadas", sessions, 25),
    make("reps_100", "chart", "100 repeticiones", "Sumaste 100 repeticiones", reps, 100),
    make("halfway", "target", "A mitad de camino", "Llegaste al 50 % de tu meta de movimiento", best, 50),
    make("goal", "trophy", "Meta alcanzada", "Alcanzaste tu meta de movimiento", best, 100),
  ];
}

// Los datos del paciente tal como quedan al guardar una sesión (sin volver a pedirlos al servidor).
// `session` es la respuesta de POST /patients/:id/sessions.
export function afterSession({ totals, plans }, planId, session) {
  return {
    totals: { sessions: (totals?.sessions ?? 0) + 1, reps: (totals?.reps ?? 0) + (session.reps_completed ?? 0) },
    plans: plans.map((p) => (p.plan_id === planId && session.flexion != null ? { ...p, history: [...(p.history ?? []), { flexion: session.flexion }] } : p)),
  };
}

// Logros que esta sesión acaba de desbloquear (ganados después y no antes).
export function newAchievements(before, planId, session) {
  const was = new Set(achievements(before).filter((a) => a.earned).map((a) => a.id));
  return achievements(afterSession(before, planId, session)).filter((a) => a.earned && !was.has(a.id));
}
