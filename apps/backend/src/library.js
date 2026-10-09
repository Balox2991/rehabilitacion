// Consultas de la biblioteca de ejercicios, rutinas y evidencia.
import { toEmbedUrl } from "./video.js";

export const PHASES = ["proteccion", "movilidad", "fortalecimiento", "funcional"];
export const AREAS = ["rodilla", "tobillo", "codo", "muneca", "hombro", "general"];
export const CATEGORIES = ["movilidad", "fortalecimiento", "educacion"];

// Áreas de rutinas que le sirven a un paciente según la articulación de sus planes.
const AREAS_FOR_JOINT = { rodilla: ["rodilla", "tobillo"], codo: ["codo", "muneca"], hombro: ["hombro"] };

const parseItem = (row) => ({
  ...row,
  steps: JSON.parse(row.steps),
  cautions: JSON.parse(row.cautions),
  video_embed_url: toEmbedUrl(row.video_url),
});

export function listLibrary(db, { area, phase, category, q } = {}) {
  const where = [];
  const args = [];
  if (area) { where.push("body_area = ?"); args.push(area); }
  if (phase) { where.push("phase = ?"); args.push(phase); }
  if (category) { where.push("category = ?"); args.push(category); }
  if (q) { where.push("(title LIKE ? OR summary LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  return db
    .prepare(`SELECT * FROM library_items ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort`)
    .all(...args)
    .map(parseItem);
}

export function getLibraryItem(db, code) {
  const row = db.prepare("SELECT * FROM library_items WHERE code = ?").get(code);
  if (!row) return null;
  const evidence = db
    .prepare(
      `SELECT e.* FROM evidence e JOIN library_evidence le ON le.evidence_code = e.code
        WHERE le.library_code = ? ORDER BY e.year DESC`
    )
    .all(code);
  return { ...parseItem(row), evidence };
}

export function listRoutines(db, { area, phase } = {}) {
  const where = [];
  const args = [];
  if (area) { where.push("r.body_area = ?"); args.push(area); }
  if (phase) { where.push("r.phase = ?"); args.push(phase); }
  return db
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM routine_items ri WHERE ri.routine_id = r.id) AS item_count
         FROM routines r ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.id`
    )
    .all(...args);
}

export function getRoutine(db, code) {
  const routine = db.prepare("SELECT * FROM routines WHERE code = ?").get(code);
  if (!routine) return null;
  const items = db
    .prepare(
      `SELECT ri.position, ri.sets, ri.reps, ri.hold_seconds, ri.note,
              li.code, li.title, li.summary, li.body_area, li.category, li.difficulty, li.duration_min, li.demo,
              li.tracked_exercise_code
         FROM routine_items ri JOIN library_items li ON li.code = ri.library_code
        WHERE ri.routine_id = ? ORDER BY ri.position`
    )
    .all(routine.id);
  return { ...routine, items };
}

export function listEvidence(db) {
  return db.prepare("SELECT * FROM evidence ORDER BY topic, year DESC").all();
}

// Rutinas asignadas (activas) a un paciente.
export function assignedRoutines(db, patientId) {
  return db
    .prepare(
      `SELECT pr.id AS assignment_id, pr.created_at AS assigned_at, u.name AS assigned_by_name,
              r.code, r.title, r.summary, r.body_area, r.phase, r.duration_min,
              (SELECT COUNT(*) FROM routine_items ri WHERE ri.routine_id = r.id) AS item_count
         FROM patient_routines pr
         JOIN routines r ON r.id = pr.routine_id
         LEFT JOIN users u ON u.id = pr.assigned_by
        WHERE pr.patient_id = ? AND pr.active = 1 ORDER BY pr.id DESC`
    )
    .all(patientId);
}

// Regla de recomendación (simple y explicable, no un modelo):
//  1. Solo rutinas de las áreas del cuerpo de los planes activos del paciente.
//  2. Si el fisioterapeuta definió la fase de recuperación, solo rutinas de esa fase o de la inmediatamente
//     anterior: la app nunca "adelanta" al paciente a una etapa más exigente, ni le ofrece una de etapas
//     que ya superó. Sin fase definida se ofrecen todas las de su área.
//  3. Se excluyen las que ya tiene asignadas. Máximo 3, primero las de la fase más avanzada.
export function recommendRoutines(db, patientId, { joints, phase }) {
  const areas = [...new Set(joints.flatMap((j) => AREAS_FOR_JOINT[j] ?? []))];
  if (!areas.length) return [];
  const assigned = new Set(assignedRoutines(db, patientId).map((r) => r.code));
  const maxPhase = phase ? PHASES.indexOf(phase) : PHASES.length - 1;
  const minPhase = phase ? Math.max(0, maxPhase - 1) : 0;
  return listRoutines(db)
    .filter((r) => areas.includes(r.body_area) && PHASES.indexOf(r.phase) <= maxPhase && PHASES.indexOf(r.phase) >= minPhase && !assigned.has(r.code))
    .sort((a, b) => PHASES.indexOf(b.phase) - PHASES.indexOf(a.phase))
    .slice(0, 3);
}
