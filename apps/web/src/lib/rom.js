// Misma convención que apps/backend/src/analytics.js (mantener sincronizadas; ver docs/FASE-3-WEB.md):
// "flexión" = grados de movimiento con 0 en reposo. El motor mide el ángulo interno de la articulación.
export const flexionFromAngle = (direction, angle) => (direction === "decreasing" ? 180 - angle : angle);

// Inversa: el fisioterapeuta piensa en grados de flexión ("90° de flexión"); el motor y el plan guardan el ángulo interno.
export const angleFromFlexion = (direction, flexion) => (direction === "decreasing" ? 180 - flexion : flexion);
