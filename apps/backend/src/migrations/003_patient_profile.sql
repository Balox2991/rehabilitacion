-- Migración 3 — ficha completa del paciente (convenciones colombianas), foto, consentimiento y umbrales configurables.
-- Ver docs/CONSIDERACIONES-COLOMBIA.md para el porqué de cada campo.

ALTER TABLE patient_profiles ADD COLUMN document_type TEXT
  CHECK (document_type IN ('CC', 'TI', 'CE', 'PA', 'RC', 'OT'));
ALTER TABLE patient_profiles ADD COLUMN document_number TEXT;
ALTER TABLE patient_profiles ADD COLUMN birth_date TEXT;
ALTER TABLE patient_profiles ADD COLUMN phone TEXT;                    -- solo dígitos (celular: 10, empieza por 3)
ALTER TABLE patient_profiles ADD COLUMN city TEXT;
ALTER TABLE patient_profiles ADD COLUMN eps TEXT;                      -- EPS o aseguradora (texto libre: el listado cambia)
ALTER TABLE patient_profiles ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE patient_profiles ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE patient_profiles ADD COLUMN diagnosis_code TEXT;           -- CIE-10, ej. S82.2
ALTER TABLE patient_profiles ADD COLUMN surgery_date TEXT;
ALTER TABLE patient_profiles ADD COLUMN dominant_side TEXT
  CHECK (dominant_side IN ('right', 'left', 'both'));
ALTER TABLE patient_profiles ADD COLUMN occupation TEXT;
-- Autorización de tratamiento de datos personales (Ley 1581 de 2012). NULL = no registrada / revocada.
ALTER TABLE patient_profiles ADD COLUMN data_consent_at TEXT;
ALTER TABLE patient_profiles ADD COLUMN data_consent_by INTEGER REFERENCES users(id);

-- Un mismo documento no puede pertenecer a dos pacientes.
CREATE UNIQUE INDEX idx_profiles_document ON patient_profiles(document_type, document_number)
  WHERE document_number IS NOT NULL;

-- La foto vive aparte para que ninguna consulta de listado la arrastre por accidente.
CREATE TABLE patient_photos (
  patient_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        BLOB NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Umbrales de alerta por fisioterapeuta (antes eran constantes en el código).
CREATE TABLE therapist_settings (
  therapist_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  inactivity_days        INTEGER NOT NULL DEFAULT 5  CHECK (inactivity_days BETWEEN 1 AND 60),
  compensation_alert_pct INTEGER NOT NULL DEFAULT 30 CHECK (compensation_alert_pct BETWEEN 5 AND 100)
);
