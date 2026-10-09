-- Análisis posterior de cada sesión.
-- `trace` es el registro de la sesión (formato telerehab-trace/2): serie de ángulos, visibilidad, banderas de postura y el
-- «esqueleto» (12 puntos del cuerpo) para reproducir el movimiento como un muñeco. NO contiene video ni imágenes.
-- `summary` es el resultado de analyzeSession() (repeticiones con su tempo, estadísticas y sugerencias). Se guarda aparte
-- del registro para poder rehacerlo cuando el análisis mejore (POST /sessions/:id/analysis) sin pedirle nada al paciente.
CREATE TABLE IF NOT EXISTS session_analysis (
  session_id       INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  analyzer_version INTEGER NOT NULL,
  summary          TEXT NOT NULL,
  trace            TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
