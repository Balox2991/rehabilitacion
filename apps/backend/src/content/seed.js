import { EVIDENCE } from "./evidence.js";
import { LIBRARY } from "./library.js";
import { ROUTINES } from "./routines.js";

// Carga el contenido base (evidencia, biblioteca, rutinas) de forma idempotente. Se ejecuta en cada arranque:
//  - actualiza textos si cambiaron en el código;
//  - NO toca `video_url` (lo configura la clínica) ni las asignaciones de rutinas de los pacientes;
//  - valida que cada referencia cruzada exista, para que un error de tipeo falle al arrancar y no en producción;
//  - RETIRA de la base los ejercicios y rutinas que ya no están en el código (archivados en pending.js).
export function seedContent(db) {
  const evidenceCodes = new Set(EVIDENCE.map((e) => e.code));
  const libraryCodes = new Set(LIBRARY.map((l) => l.code));
  for (const item of LIBRARY) {
    for (const ev of item.evidence) {
      if (!evidenceCodes.has(ev)) throw new Error(`Contenido inválido: ${item.code} cita la evidencia inexistente "${ev}"`);
    }
  }
  for (const r of ROUTINES) {
    for (const it of r.items) {
      if (!libraryCodes.has(it.library_code)) throw new Error(`Contenido inválido: la rutina ${r.code} usa el ejercicio inexistente "${it.library_code}"`);
    }
  }

  db.exec("BEGIN");
  try {
    const upsertEvidence = db.prepare(
      `INSERT INTO evidence (code, authors, year, title, source, kind, topic, pmid, doi, url, summary, limitation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET authors = excluded.authors, year = excluded.year, title = excluded.title,
         source = excluded.source, kind = excluded.kind, topic = excluded.topic, pmid = excluded.pmid, doi = excluded.doi,
         url = excluded.url, summary = excluded.summary, limitation = excluded.limitation`
    );
    for (const e of EVIDENCE) {
      upsertEvidence.run(e.code, e.authors, e.year, e.title, e.source, e.kind, e.topic, e.pmid, e.doi, e.url, e.summary, e.limitation);
    }

    const upsertItem = db.prepare(
      `INSERT INTO library_items (code, title, body_area, category, phase, difficulty, duration_min, tracked_exercise_code, demo, summary, steps, cautions, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET title = excluded.title, body_area = excluded.body_area, category = excluded.category,
         phase = excluded.phase, difficulty = excluded.difficulty, duration_min = excluded.duration_min,
         tracked_exercise_code = excluded.tracked_exercise_code, demo = excluded.demo, summary = excluded.summary,
         steps = excluded.steps, cautions = excluded.cautions, sort = excluded.sort`
    );
    LIBRARY.forEach((l, i) =>
      upsertItem.run(l.code, l.title, l.body_area, l.category, l.phase, l.difficulty, l.duration_min, l.tracked_exercise_code, l.demo,
        l.summary, JSON.stringify(l.steps), JSON.stringify(l.cautions), i)
    );

    db.exec("DELETE FROM library_evidence");
    const link = db.prepare("INSERT INTO library_evidence (library_code, evidence_code) VALUES (?, ?)");
    for (const l of LIBRARY) for (const ev of l.evidence) link.run(l.code, ev);

    const upsertRoutine = db.prepare(
      `INSERT INTO routines (code, title, summary, body_area, phase, duration_min) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET title = excluded.title, summary = excluded.summary, body_area = excluded.body_area,
         phase = excluded.phase, duration_min = excluded.duration_min`
    );
    const routineId = db.prepare("SELECT id FROM routines WHERE code = ?");
    const clearItems = db.prepare("DELETE FROM routine_items WHERE routine_id = ?");
    const addItem = db.prepare(
      "INSERT INTO routine_items (routine_id, position, library_code, sets, reps, hold_seconds, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const r of ROUTINES) {
      upsertRoutine.run(r.code, r.title, r.summary, r.body_area, r.phase, r.duration_min);
      const { id } = routineId.get(r.code);
      clearItems.run(id);
      r.items.forEach((it, i) => addItem.run(id, i + 1, it.library_code, it.sets, it.reps, it.hold_seconds ?? null, it.note ?? null));
    }
    // Retira de la base lo que ya NO está en el código (ejercicios y rutinas archivadas). Se hace al final y a mano
    // (hijos primero) para no depender de las cascadas. Las asignaciones de una rutina retirada se retiran con ella.
    const keepRoutines = ROUTINES.map((r) => r.code);
    const keepLibrary = LIBRARY.map((l) => l.code);
    const notIn = (list) => (list.length ? `NOT IN (${list.map(() => "?").join(",")})` : "IS NOT NULL");
    db.prepare(`DELETE FROM patient_routines WHERE routine_id IN (SELECT id FROM routines WHERE code ${notIn(keepRoutines)})`).run(...keepRoutines);
    db.prepare(`DELETE FROM routine_items WHERE routine_id IN (SELECT id FROM routines WHERE code ${notIn(keepRoutines)})`).run(...keepRoutines);
    db.prepare(`DELETE FROM routines WHERE code ${notIn(keepRoutines)}`).run(...keepRoutines);
    db.prepare(`DELETE FROM library_evidence WHERE library_code ${notIn(keepLibrary)}`).run(...keepLibrary);
    db.prepare(`DELETE FROM library_items WHERE code ${notIn(keepLibrary)}`).run(...keepLibrary);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
