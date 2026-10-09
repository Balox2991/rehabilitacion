-- Fase 2 — modelo de datos del sistema de telerehabilitación.
-- Un solo tipo de cuenta (users) con rol; el perfil clínico del paciente vive aparte.
-- La autenticación (password_hash, sesiones) se agrega en la Fase 5 sobre esta misma tabla.


CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role        TEXT NOT NULL CHECK (role IN ('patient', 'therapist')),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Datos clínicos del paciente y quién es su fisioterapeuta.
CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  therapist_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  fracture_site TEXT,
  injury_date   TEXT,
  notes         TEXT
);

-- Catálogo de ejercicios; espeja las definiciones de tracking-prototype/src/angleMath.js.
CREATE TABLE IF NOT EXISTS exercises (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  joint                TEXT NOT NULL,
  rest_angle           REAL NOT NULL,
  default_target_angle REAL NOT NULL,
  direction            TEXT NOT NULL CHECK (direction IN ('increasing', 'decreasing'))
);

-- Plan prescrito por el fisioterapeuta: qué ejercicio, con qué ROM objetivo y cuánto.
CREATE TABLE IF NOT EXISTS exercise_plans (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id         INTEGER NOT NULL REFERENCES exercises(id),
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  side                TEXT NOT NULL CHECK (side IN ('left', 'right')),
  target_angle        REAL NOT NULL,
  sets                INTEGER NOT NULL DEFAULT 3 CHECK (sets > 0),
  reps_per_set        INTEGER NOT NULL DEFAULT 10 CHECK (reps_per_set > 0),
  times_per_week      INTEGER NOT NULL DEFAULT 3 CHECK (times_per_week BETWEEN 1 AND 21),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Una sesión = una vez que el paciente hace un ejercicio con la cámara.
CREATE TABLE IF NOT EXISTS sessions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id            INTEGER REFERENCES exercise_plans(id) ON DELETE SET NULL,
  exercise_id        INTEGER NOT NULL REFERENCES exercises(id),
  side               TEXT NOT NULL CHECK (side IN ('left', 'right')),
  target_angle       REAL NOT NULL,
  started_at         TEXT NOT NULL,
  ended_at           TEXT,
  reps_completed     INTEGER NOT NULL DEFAULT 0,
  best_rom           REAL, -- mejor ángulo alcanzado: el mínimo si el ejercicio es 'decreasing', el máximo si es 'increasing'
  compensation_count INTEGER NOT NULL DEFAULT 0,
  notes              TEXT
);

-- Cada repetición dentro de la sesión (alimenta el historial tipo goniómetro).
CREATE TABLE IF NOT EXISTS rep_records (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id         INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rep_number         INTEGER NOT NULL,
  rom_achieved       REAL NOT NULL,
  compensation_flags TEXT NOT NULL DEFAULT '[]',
  UNIQUE (session_id, rep_number)
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_plans_patient ON exercise_plans(patient_id, active);
CREATE INDEX IF NOT EXISTS idx_profiles_therapist ON patient_profiles(therapist_id);
