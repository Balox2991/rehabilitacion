// Asistente de recuperación: arma, para cada plan activo de un paciente, el historial de sus sesiones y se lo entrega al
// motor (apps/tracking-prototype/src/coach.js), que es puro y está probado por separado. Aquí solo hay lectura de la base.
//
// Qué usa de cada sesión: el mejor movimiento (siempre existe) y, si la sesión se guardó con registro, lo que dijo el
// análisis del video (cansancio, ritmo, postura, visibilidad). Las sesiones antiguas sin análisis aportan solo la tendencia.
import { COACH, coach } from "./engine.js";
import { flexion } from "./analytics.js";
import { listEvidence } from "./library.js";

const DAY_MS = 86_400_000;
const parseUtc = (s) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).getTime(); // la base guarda «YYYY-MM-DD HH:MM:SS» en UTC

function sessionRow(r, direction) {
  const analysis = r.summary ? JSON.parse(r.summary) : null;
  const codes = new Set((analysis?.suggestions ?? []).map((s) => s.code));
  return {
    id: r.id,
    started_at: r.started_at,
    flexion: flexion(direction, r.best_rom),
    reps: r.reps_completed,
    // Con análisis, el % de repeticiones con alerta sale de él; sin análisis, de las alertas guardadas con la sesión.
    flagged_pct: analysis ? analysis.summary.flagged_pct : r.reps_completed ? Math.round((r.compensation_count / r.reps_completed) * 100) : null,
    drop_pct: analysis?.summary.rom.drop_pct ?? null,
    fast: analysis ? codes.has("fast_up") || codes.has("fast_down") : null,
    low_visibility: analysis ? codes.has("low_visibility") : null,
    analysis,
  };
}

/**
 * @param {object} db
 * @param {number} patientId
 * @param {{now: Date, sessionId?: number|null}} o  `sessionId` fija «la sesión de hoy» (por defecto, la más reciente de cada plan)
 */
export function coachingFor(db, patientId, { now, sessionId = null }) {
  const phase = db.prepare("SELECT recovery_phase FROM patient_profiles WHERE user_id = ?").get(patientId)?.recovery_phase ?? null;
  const plans = db
    .prepare(
      `SELECT pl.*, e.code AS exercise_code, e.name AS exercise_name, e.direction, e.rest_angle
         FROM exercise_plans pl JOIN exercises e ON e.id = pl.exercise_id
        WHERE pl.patient_id = ? AND pl.active = 1 ORDER BY pl.id`
    )
    .all(patientId);
  const sessionsOf = db.prepare(
    `SELECT s.id, s.started_at, s.best_rom, s.reps_completed, s.compensation_count, a.summary
       FROM sessions s LEFT JOIN session_analysis a ON a.session_id = s.id
      WHERE s.patient_id = ? AND s.exercise_id = ? AND s.side = ? AND s.best_rom IS NOT NULL
      ORDER BY s.started_at, s.id`
  );

  const libraryOf = db.prepare("SELECT code FROM library_items WHERE tracked_exercise_code = ?");
  const out = [];
  const evidenceCodes = new Set();
  for (const pl of plans) {
    let rows = sessionsOf.all(patientId, pl.exercise_id, pl.side).map((r) => sessionRow(r, pl.direction));
    if (sessionId != null) {
      const at = rows.findIndex((r) => r.id === sessionId);
      if (at === -1) continue; // esa sesión no es de este plan
      rows = rows.slice(0, at + 1);
    }
    const windowStart = now.getTime() - COACH.adherenceWindowDays * DAY_MS;
    const result = coach({
      exercise: { direction: pl.direction, rest: pl.rest_angle },
      plan: { ...pl, plan_id: pl.id }, // el motor habla de plan_id; la fila de la base de id
      phase,
      history: rows,
      current: rows.length ? rows[rows.length - 1].analysis : null,
      recentSessions: rows.filter((r) => parseUtc(r.started_at) >= windowStart && parseUtc(r.started_at) <= now.getTime()).length,
      planAgeDays: Math.max(0, Math.floor((now.getTime() - parseUtc(pl.created_at)) / DAY_MS)),
    });
    for (const x of [...Object.values(result.patient).flat(), ...result.therapist]) x.evidence.forEach((c) => evidenceCodes.add(c));
    out.push({
      plan_id: pl.id,
      exercise_code: pl.exercise_code,
      exercise_name: pl.exercise_name,
      library_code: libraryOf.get(pl.exercise_code)?.code ?? null, // la ficha «cómo se hace» de este ejercicio
      side: pl.side,
      session_id: rows.length ? rows[rows.length - 1].id : null,
      sessions: rows.length,
      ...result,
    });
  }
  // Los estudios citados, completos (con su resumen y lo que NO demuestran), para mostrarlos junto a la recomendación.
  const evidence = listEvidence(db).filter((e) => evidenceCodes.has(e.code));
  return { patient_id: patientId, plans: out, evidence };
}
