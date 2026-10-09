import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { seedContent } from "./content/seed.js";
import { SPECS, validateSpec } from "./engine.js";

// Migraciones versionadas: se aplican en orden y una sola vez. La versión aplicada vive en la propia base
// (PRAGMA user_version), así una base de desarrollo antigua se actualiza sin borrarla.
// Para cambiar el esquema NUNCA edites una migración ya publicada: agrega la siguiente.
const MIGRATIONS = [
  { version: 1, name: "esquema base", file: "001_base.sql" },
  { version: 2, name: "biblioteca, rutinas, evidencia y notas", file: "002_content.sql" },
  { version: 3, name: "ficha del paciente, foto, consentimiento y umbrales", file: "003_patient_profile.sql" },
  { version: 4, name: "análisis posterior de cada sesión", file: "004_session_analysis.sql" },
  { version: 5, name: "especificación de cada ejercicio", file: "005_exercise_specs.sql" },
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1).version;

// Ejecuta fn dentro de una transacción; revierte todo si lanza.
export function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function migrate(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  for (const m of MIGRATIONS.filter((x) => x.version > current)) {
    const sql = readFileSync(new URL(`./migrations/${m.file}`, import.meta.url), "utf8");
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
}

export function openDb(file = ":memory:") {
  if (file !== ":memory:") mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);

  // El catálogo de ejercicios sale de las especificaciones del motor (tracking-prototype/src/exerciseSpecs.js): una sola
  // fuente. Se actualiza en cada arranque (las filas conservan su id, así los planes y sesiones existentes no se rompen).
  const upsert = db.prepare(
    `INSERT INTO exercises (code, name, joint, rest_angle, default_target_angle, direction, spec) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, joint = excluded.joint, rest_angle = excluded.rest_angle,
       default_target_angle = excluded.default_target_angle, direction = excluded.direction, spec = excluded.spec`
  );
  for (const raw of SPECS) {
    const { spec, error } = validateSpec(raw);
    if (error) throw new Error(`Especificación inválida en el motor (${raw.code}): ${error}`);
    upsert.run(spec.code, spec.label, spec.joint, spec.rest, spec.target, spec.direction, JSON.stringify(spec));
  }

  seedContent(db); // biblioteca, rutinas y evidencia: idempotente
  return db;
}
