// Estadísticas para los dashboards. Toda la lógica de negocio (adherencia, progreso, alertas)
// vive aquí, en el servidor, para que el paciente y el fisioterapeuta vean siempre los mismos números.
//
// Convenciones:
//  - Las marcas de tiempo se guardan en UTC ISO, pero los "días" (racha, hoy, última sesión, tira de 7 días)
//    se cuentan en la zona horaria del usuario: el cliente envía `tz` = minutos al este de UTC (Colombia: -300).
//    Sin `tz` se usa UTC. Las ventanas de "7 / 30 días" son duraciones, no dependen de la zona.
//  - "Flexión" = grados de movimiento logrados, con 0 en reposo, como se reporta en goniometría clínica.
//    El motor de tracking mide el ángulo interno de la articulación (rodilla extendida ≈ 175°), así que
//    para ejercicios 'decreasing' flexión = 180 − ángulo; para 'increasing' (hombro) flexión = ángulo.

import { assignedRoutines, recommendRoutines } from "./library.js";
import { ageOn } from "./validators.js";

const DAY_MS = 86_400_000;

// Umbrales de alerta. Son VALORES DE EJEMPLO, no criterio clínico: cada fisioterapeuta los ajusta
// (tabla therapist_settings) y esta es solo la base cuando no ha configurado nada.
export const DEFAULT_SETTINGS = { inactivity_days: 5, compensation_alert_pct: 30 };

export function getSettings(db, therapistId) {
  const row = therapistId == null ? null : db.prepare("SELECT inactivity_days, compensation_alert_pct FROM therapist_settings WHERE therapist_id = ?").get(therapistId);
  return row ? { ...row } : { ...DEFAULT_SETTINGS };
}

export function saveSettings(db, therapistId, { inactivity_days, compensation_alert_pct }) {
  db.prepare(
    `INSERT INTO therapist_settings (therapist_id, inactivity_days, compensation_alert_pct) VALUES (?, ?, ?)
     ON CONFLICT(therapist_id) DO UPDATE SET inactivity_days = excluded.inactivity_days, compensation_alert_pct = excluded.compensation_alert_pct`
  ).run(therapistId, inactivity_days, compensation_alert_pct);
  return getSettings(db, therapistId);
}

export const flexion = (direction, angle) => (direction === "decreasing" ? 180 - angle : angle);

// Porcentaje del camino recorrido entre la posición de reposo y el objetivo del plan (0–100).
export function progressPct({ direction, rest_angle }, targetAngle, angle) {
  if (angle == null) return null;
  const rest = flexion(direction, rest_angle);
  const target = flexion(direction, targetAngle);
  if (target === rest) return null;
  const pct = ((flexion(direction, angle) - rest) / (target - rest)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

// Fecha calendario (YYYY-MM-DD) de un instante, vista desde la zona horaria `tz` (minutos al este de UTC).
const dayKey = (ms, tz) => new Date(ms + tz * 60_000).toISOString().slice(0, 10);
const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / DAY_MS;
// Días de calendario entre dos instantes en la zona `tz` (medianoche a medianoche, no múltiplos de 24 h).
const calendarDays = (aMs, bMs, tz) => dayNumber(dayKey(aMs, tz)) - dayNumber(dayKey(bMs, tz));
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

function streakDays(sessionDays, nowMs, tz) {
  let cursor = nowMs;
  if (!sessionDays.has(dayKey(cursor, tz))) cursor -= DAY_MS; // hoy aún no cuenta contra la racha
  let streak = 0;
  while (sessionDays.has(dayKey(cursor, tz))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

const SESSION_COLS = `s.id, s.patient_id, s.started_at, s.exercise_id, s.side, s.target_angle, s.reps_completed,
  s.best_rom, s.compensation_count, e.code AS exercise_code, e.name AS exercise_name, e.direction, e.rest_angle`;

function activePlans(db, patientIds) {
  if (!patientIds.length) return [];
  return db
    .prepare(
      `SELECT pl.*, e.code AS exercise_code, e.name AS exercise_name, e.joint, e.direction, e.rest_angle, e.spec AS exercise_spec
         FROM exercise_plans pl JOIN exercises e ON e.id = pl.exercise_id
        WHERE pl.active = 1 AND pl.patient_id IN (${patientIds.map(() => "?").join(",")}) ORDER BY pl.id`
    )
    .all(...patientIds);
}

function latestFor(sessions, plan) {
  // sessions viene ordenado por started_at ascendente
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].exercise_id === plan.exercise_id && sessions[i].side === plan.side) return sessions[i];
  }
  return null;
}

// Cuántas sesiones de un plan se hicieron en los últimos 7 días, sin pasar de lo prescrito.
function doneThisWeek(sessions, plan, now) {
  const since = now.getTime() - 7 * DAY_MS;
  const n = sessions.filter(
    (s) => s.exercise_id === plan.exercise_id && s.side === plan.side && Date.parse(s.started_at) > since
  ).length;
  return n;
}

// ---------------------------------------------------------------------------------------------

// Fila de estado de UN paciente. Es la única fuente de la lógica de estados y alertas: la usan tanto el panel del
// fisioterapeuta como la ficha del paciente, así ambos muestran siempre lo mismo.
export function summarizePatient({ patient, sessions, plans, now, tz, settings }) {
  const nowMs = now.getTime();
  const planned = plans.reduce((n, pl) => n + pl.times_per_week, 0);
  const done = plans.reduce((n, pl) => n + Math.min(doneThisWeek(sessions, pl, now), pl.times_per_week), 0);
  const month = sessions.filter((s) => Date.parse(s.started_at) >= nowMs - 30 * DAY_MS);
  const reps30 = month.reduce((n, s) => n + s.reps_completed, 0);
  const comp30 = month.reduce((n, s) => n + s.compensation_count, 0);
  const progresses = plans
    .map((pl) => {
      const last = latestFor(sessions, pl);
      return last ? progressPct(pl, pl.target_angle, last.best_rom) : null;
    })
    .filter((v) => v != null);
  const progress = progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : null;
  const lastSession = sessions.at(-1)?.started_at ?? null;
  const daysSince = lastSession ? calendarDays(nowMs, Date.parse(lastSession), tz) : null;

  let status;
  if (!plans.length) status = "sin_plan";
  else if (daysSince == null || daysSince >= settings.inactivity_days) status = "sin_actividad";
  else if (reps30 > 0 && (comp30 / reps30) * 100 >= settings.compensation_alert_pct) status = "compensaciones";
  else if (progress != null && progress >= 100) status = "en_meta";
  else status = "al_dia";

  return {
    id: patient.id,
    name: patient.name,
    fracture_site: patient.fracture_site,
    diagnosis_code: patient.diagnosis_code ?? null,
    recovery_phase: patient.recovery_phase ?? null,
    age: patient.birth_date ? ageOn(patient.birth_date, now) : null,
    phone: patient.phone ?? null,
    city: patient.city ?? null,
    eps: patient.eps ?? null,
    has_photo: Boolean(patient.photo_updated_at),
    photo_v: patient.photo_updated_at ?? null,
    days_since_injury: patient.injury_date ? Math.max(0, dayNumber(dayKey(nowMs, tz)) - dayNumber(patient.injury_date)) : null,
    exercises: plans.map((pl) => `${pl.exercise_name} (${pl.side === "left" ? "izq." : "der."})`),
    planned_per_week: planned,
    done_7d: done,
    adherence_pct: pct(done, planned),
    last_session_at: lastSession,
    days_since_last_session: daysSince,
    progress_pct: progress,
    compensation_rate_30d: reps30 ? round1((comp30 / reps30) * 100) : null,
    status,
  };
}

// ---------------------------------------------------------------------------------------------

export function patientOverview(db, patientId, now, tz = 0) {
  const patient = db
    .prepare(
      `SELECT u.id, u.name, p.fracture_site, p.injury_date, p.recovery_phase, p.therapist_id, t.name AS therapist_name,
              p.birth_date, p.phone, p.city, p.eps, p.diagnosis_code, p.document_type, p.document_number, p.dominant_side,
              ph.updated_at AS photo_updated_at
         FROM users u LEFT JOIN patient_profiles p ON p.user_id = u.id LEFT JOIN users t ON t.id = p.therapist_id
         LEFT JOIN patient_photos ph ON ph.patient_id = u.id
        WHERE u.id = ? AND u.role = 'patient'`
    )
    .get(patientId);
  if (!patient) return null;

  const sessions = db
    .prepare(`SELECT ${SESSION_COLS} FROM sessions s JOIN exercises e ON e.id = s.exercise_id WHERE s.patient_id = ? ORDER BY s.started_at`)
    .all(patientId);
  const plans = activePlans(db, [patientId]);
  const libraryByExercise = new Map(
    db.prepare("SELECT tracked_exercise_code AS ex, code FROM library_items WHERE tracked_exercise_code IS NOT NULL").all().map((r) => [r.ex, r.code])
  );

  const sessionDay = (s) => dayKey(Date.parse(s.started_at), tz);
  const days = new Set(sessions.map(sessionDay));
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const date = dayKey(now.getTime() - i * DAY_MS, tz);
    last7.push({ date, sessions: sessions.filter((s) => sessionDay(s) === date).length });
  }

  return {
    patient: {
      id: patient.id,
      name: patient.name,
      fracture_site: patient.fracture_site,
      injury_date: patient.injury_date,
      recovery_phase: patient.recovery_phase,
      therapist_id: patient.therapist_id,
      age: patient.birth_date ? ageOn(patient.birth_date, now) : null,
      phone: patient.phone,
      city: patient.city,
      eps: patient.eps,
      diagnosis_code: patient.diagnosis_code,
      document_type: patient.document_type,
      document_number: patient.document_number,
      dominant_side: patient.dominant_side,
      has_photo: Boolean(patient.photo_updated_at),
      photo_v: patient.photo_updated_at,
      days_since_injury: patient.injury_date ? Math.max(0, dayNumber(dayKey(now.getTime(), tz)) - dayNumber(patient.injury_date)) : null,
      therapist_name: patient.therapist_name,
    },
    totals: { sessions: sessions.length, reps: sessions.reduce((n, s) => n + s.reps_completed, 0) },
    summary: summarizePatient({ patient, sessions, plans, now, tz, settings: getSettings(db, patient.therapist_id) }),
    routines: {
      assigned: assignedRoutines(db, patientId),
      recommended: recommendRoutines(db, patientId, { joints: plans.map((pl) => pl.joint), phase: patient.recovery_phase }),
    },
    streak_days: streakDays(days, now.getTime(), tz),
    last_7_days: last7,
    plans: plans.map((pl) => {
      const mine = sessions.filter((s) => s.exercise_id === pl.exercise_id && s.side === pl.side && s.best_rom != null);
      const latest = mine.at(-1) ?? null;
      return {
        plan_id: pl.id,
        exercise_code: pl.exercise_code,
        exercise_name: pl.exercise_name,
        spec: pl.exercise_spec ? JSON.parse(pl.exercise_spec) : null, // cómo se mide: la pantalla arma el ejercicio a partir de esto
        library_code: libraryByExercise.get(pl.exercise_code) ?? null,
        side: pl.side,
        target_angle: pl.target_angle,
        sets: pl.sets,
        reps_per_set: pl.reps_per_set,
        times_per_week: pl.times_per_week,
        done_7d: Math.min(doneThisWeek(sessions, pl, now), pl.times_per_week),
        rest_flexion: flexion(pl.direction, pl.rest_angle),
        target_flexion: flexion(pl.direction, pl.target_angle),
        latest_flexion: latest ? round1(flexion(pl.direction, latest.best_rom)) : null,
        progress_pct: latest ? progressPct(pl, pl.target_angle, latest.best_rom) : null,
        history: mine.map((s) => ({ session_id: s.id, started_at: s.started_at, flexion: round1(flexion(pl.direction, s.best_rom)) })),
      };
    }),
    recent_sessions: sessions
      .slice(-5)
      .reverse()
      .map((s) => ({
        id: s.id,
        started_at: s.started_at,
        exercise_name: s.exercise_name,
        side: s.side,
        reps_completed: s.reps_completed,
        flexion: s.best_rom == null ? null : round1(flexion(s.direction, s.best_rom)),
        compensation_count: s.compensation_count,
      })),
  };
}

// ---------------------------------------------------------------------------------------------

export function therapistSummary(db, therapistId, now, tz = 0) {
  const therapist = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'therapist'").get(therapistId);
  if (!therapist) return null;

  const patients = db
    .prepare(
      `SELECT u.id, u.name, p.fracture_site, p.injury_date, p.recovery_phase, p.birth_date, p.phone, p.city, p.eps, p.diagnosis_code,
              ph.updated_at AS photo_updated_at
         FROM patient_profiles p JOIN users u ON u.id = p.user_id LEFT JOIN patient_photos ph ON ph.patient_id = u.id
        WHERE p.therapist_id = ? ORDER BY u.name`
    )
    .all(therapistId);
  const ids = patients.map((p) => p.id);
  const inList = ids.map(() => "?").join(",");

  const sessionsByPatient = new Map(ids.map((id) => [id, []]));
  if (ids.length) {
    // Historial completo: "última sesión" y "progreso" deben salir de la sesión más reciente aunque sea antigua.
    // Las ventanas de 7 / 30 días y las 8 semanas se filtran más abajo.
    const rows = db
      .prepare(
        `SELECT ${SESSION_COLS} FROM sessions s JOIN exercises e ON e.id = s.exercise_id
          WHERE s.patient_id IN (${inList}) ORDER BY s.started_at`
      )
      .all(...ids);
    for (const r of rows) sessionsByPatient.get(r.patient_id).push(r);
  }
  const plansByPatient = new Map(ids.map((id) => [id, []]));
  for (const pl of activePlans(db, ids)) plansByPatient.get(pl.patient_id).push(pl);

  const settings = getSettings(db, therapistId);
  const monthAgo = now.getTime() - 30 * DAY_MS;
  const rows = patients.map((p) =>
    summarizePatient({ patient: p, sessions: sessionsByPatient.get(p.id), plans: plansByPatient.get(p.id), now, tz, settings })
  );

  const ATTENTION = { sin_actividad: 0, compensaciones: 1 };
  rows.sort((a, b) => (ATTENTION[a.status] ?? 9) - (ATTENTION[b.status] ?? 9) || a.name.localeCompare(b.name));

  // Serie semanal: 8 ventanas de 7 días que terminan ahora, de la más antigua a la más reciente.
  const all = [...sessionsByPatient.values()].flat();
  const weekly = [];
  for (let i = 7; i >= 0; i--) {
    const end = now.getTime() - i * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWin = all.filter((s) => {
      const t = Date.parse(s.started_at);
      return t > start && t <= end;
    });
    weekly.push({ week_start: dayKey(start + DAY_MS, tz), sessions: inWin.length, reps: inWin.reduce((n, s) => n + s.reps_completed, 0) });
  }

  // Tipos de compensación más frecuentes en los últimos 30 días.
  const breakdown = new Map();
  if (ids.length) {
    const flagRows = db
      .prepare(
        `SELECT r.compensation_flags FROM rep_records r JOIN sessions s ON s.id = r.session_id
          WHERE s.patient_id IN (${inList}) AND s.started_at >= ? AND r.compensation_flags <> '[]'`
      )
      .all(...ids, new Date(monthAgo).toISOString());
    for (const r of flagRows) for (const f of JSON.parse(r.compensation_flags)) breakdown.set(f, (breakdown.get(f) ?? 0) + 1);
  }

  const withPlan = rows.filter((r) => r.planned_per_week > 0);
  const plannedTotal = withPlan.reduce((n, r) => n + r.planned_per_week, 0);
  const doneTotal = withPlan.reduce((n, r) => n + r.done_7d, 0);
  const progressVals = rows.map((r) => r.progress_pct).filter((v) => v != null);
  const reps30All = all.filter((s) => Date.parse(s.started_at) >= monthAgo);
  const repsTotal30 = reps30All.reduce((n, s) => n + s.reps_completed, 0);
  const compTotal30 = reps30All.reduce((n, s) => n + s.compensation_count, 0);

  return {
    therapist,
    settings,
    kpis: {
      patients: rows.length,
      needing_attention: rows.filter((r) => r.status === "sin_actividad" || r.status === "compensaciones").length,
      sessions_7d: all.filter((s) => Date.parse(s.started_at) > now.getTime() - 7 * DAY_MS).length,
      adherence_pct: pct(doneTotal, plannedTotal),
      avg_progress_pct: progressVals.length ? Math.round(progressVals.reduce((a, b) => a + b, 0) / progressVals.length) : null,
      compensation_rate_30d: repsTotal30 ? round1((compTotal30 / repsTotal30) * 100) : null,
    },
    weekly_sessions: weekly,
    compensation_breakdown: [...breakdown].map(([flag, count]) => ({ flag, count })).sort((a, b) => b.count - a.count),
    patients: rows,
  };
}

// ---------------------------------------------------------------------------------------------
// Informe clínico de un paciente (para imprimir o guardar como PDF desde el navegador).

export function patientReport(db, patientId, now, tz = 0) {
  const overview = patientOverview(db, patientId, now, tz);
  if (!overview) return null;

  const sessions = db
    .prepare(`SELECT ${SESSION_COLS} FROM sessions s JOIN exercises e ON e.id = s.exercise_id WHERE s.patient_id = ? ORDER BY s.started_at`)
    .all(patientId);
  const plans = activePlans(db, [patientId]);
  const monthAgo = now.getTime() - 30 * DAY_MS;

  const planRows = overview.plans.map((p, i) => {
    const mine = sessions.filter((s) => s.exercise_id === plans[i].exercise_id && s.side === p.side);
    const reps = mine.reduce((n, s) => n + s.reps_completed, 0);
    const comp = mine.reduce((n, s) => n + s.compensation_count, 0);
    const flexions = p.history.map((h) => h.flexion);
    return {
      plan_id: p.plan_id,
      exercise_name: p.exercise_name,
      side: p.side,
      sets: p.sets,
      reps_per_set: p.reps_per_set,
      times_per_week: p.times_per_week,
      rest_flexion: p.rest_flexion,
      target_flexion: p.target_flexion,
      baseline_flexion: flexions[0] ?? null, // primera sesión registrada
      latest_flexion: p.latest_flexion,
      best_flexion: flexions.length ? Math.max(...flexions) : null,
      change_flexion: flexions.length ? round1(flexions.at(-1) - flexions[0]) : null,
      progress_pct: p.progress_pct,
      sessions: mine.length,
      compensation_rate_pct: reps ? round1((comp / reps) * 100) : null,
      history: p.history,
    };
  });

  // Adherencia de las últimas 8 semanas frente al plan ACTIVO ACTUAL (no guardamos el historial de cambios del plan).
  const planned = plans.reduce((n, pl) => n + pl.times_per_week, 0);
  const weekly = [];
  for (let i = 7; i >= 0; i--) {
    const end = now.getTime() - i * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const count = sessions.filter((s) => {
      const t = Date.parse(s.started_at);
      return t > start && t <= end;
    }).length;
    weekly.push({ week_start: dayKey(start + DAY_MS, tz), sessions: count, planned });
  }
  const adherence = planned ? pct(weekly.reduce((n, w) => n + Math.min(w.sessions, planned), 0), planned * weekly.length) : null;

  const notes = db
    .prepare(
      `SELECT n.id, n.body, n.created_at, u.name AS author_name FROM patient_notes n LEFT JOIN users u ON u.id = n.author_id
        WHERE n.patient_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 10`
    )
    .all(patientId);

  const reps30 = sessions.filter((s) => Date.parse(s.started_at) >= monthAgo);
  const repsTotal30 = reps30.reduce((n, s) => n + s.reps_completed, 0);
  const compTotal30 = reps30.reduce((n, s) => n + s.compensation_count, 0);

  return {
    generated_at: now.toISOString(),
    patient: overview.patient,
    first_session_at: sessions[0]?.started_at ?? null,
    summary: {
      sessions: overview.totals.sessions,
      reps: overview.totals.reps,
      streak_days: overview.streak_days,
      adherence_8w_pct: adherence,
      compensation_rate_30d_pct: repsTotal30 ? round1((compTotal30 / repsTotal30) * 100) : null,
    },
    plans: planRows,
    weekly,
    routines: overview.routines.assigned,
    notes,
  };
}
