-- Migración 2 — biblioteca de ejercicios, rutinas, evidencia clínica, notas y fase de recuperación.

-- Fase de recuperación del paciente (la define el fisioterapeuta). NULL = sin definir.
ALTER TABLE patient_profiles ADD COLUMN recovery_phase TEXT
  CHECK (recovery_phase IN ('proteccion', 'movilidad', 'fortalecimiento', 'funcional'));

-- Estudios y referencias citables. El contenido está verificado contra PubMed / arXiv (ver src/content/evidence.js).
CREATE TABLE evidence (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  authors     TEXT NOT NULL,
  year        INTEGER NOT NULL,
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,          -- revista o repositorio
  kind        TEXT NOT NULL CHECK (kind IN ('revision_sistematica', 'guia_clinica', 'estudio_validacion', 'articulo_tecnico')),
  topic       TEXT NOT NULL CHECK (topic IN ('telerrehabilitacion', 'fracturas', 'medicion', 'adherencia')),
  pmid        TEXT,
  doi         TEXT,
  url         TEXT NOT NULL,
  summary     TEXT NOT NULL,          -- qué encontró (solo lo que dice el resumen del artículo)
  limitation  TEXT NOT NULL           -- qué NO demuestra
);

-- Ejercicios y contenido educativo que ve el paciente. Algunos se miden con cámara (tracked_exercise_code).
CREATE TABLE library_items (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  code                   TEXT NOT NULL UNIQUE,
  title                  TEXT NOT NULL,
  body_area              TEXT NOT NULL CHECK (body_area IN ('rodilla', 'tobillo', 'codo', 'muneca', 'hombro', 'general')),
  category               TEXT NOT NULL CHECK (category IN ('movilidad', 'fortalecimiento', 'educacion')),
  phase                  TEXT NOT NULL CHECK (phase IN ('proteccion', 'movilidad', 'fortalecimiento', 'funcional')),
  difficulty             INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  duration_min           INTEGER NOT NULL DEFAULT 5,
  tracked_exercise_code  TEXT REFERENCES exercises(code),
  demo                   TEXT,        -- clave de la demostración animada del frontend; NULL si no tiene
  summary                TEXT NOT NULL,
  steps                  TEXT NOT NULL DEFAULT '[]',    -- JSON: lista de textos
  cautions               TEXT NOT NULL DEFAULT '[]',    -- JSON: lista de textos
  video_url              TEXT,        -- lo configura la clínica; NUNCA lo pisa el contenido base
  sort                   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE library_evidence (
  library_code   TEXT NOT NULL REFERENCES library_items(code) ON DELETE CASCADE,
  evidence_code  TEXT NOT NULL REFERENCES evidence(code) ON DELETE CASCADE,
  PRIMARY KEY (library_code, evidence_code)
);

CREATE TABLE routines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  body_area     TEXT NOT NULL CHECK (body_area IN ('rodilla', 'tobillo', 'codo', 'muneca', 'hombro', 'general')),
  phase         TEXT NOT NULL CHECK (phase IN ('proteccion', 'movilidad', 'fortalecimiento', 'funcional')),
  duration_min  INTEGER NOT NULL
);

CREATE TABLE routine_items (
  routine_id    INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  library_code  TEXT NOT NULL REFERENCES library_items(code),
  sets          INTEGER NOT NULL CHECK (sets > 0),
  reps          INTEGER NOT NULL CHECK (reps > 0),
  hold_seconds  INTEGER CHECK (hold_seconds IS NULL OR hold_seconds > 0),
  note          TEXT,
  PRIMARY KEY (routine_id, position)
);

-- Rutinas que el fisioterapeuta asigna a un paciente.
CREATE TABLE patient_routines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id   INTEGER NOT NULL REFERENCES routines(id),
  assigned_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_patient_routines_active ON patient_routines(patient_id, routine_id) WHERE active = 1;

-- Notas clínicas del fisioterapeuta sobre la evolución del paciente.
CREATE TABLE patient_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_patient_notes_patient ON patient_notes(patient_id, created_at);
