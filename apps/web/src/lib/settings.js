// Umbrales de alerta por defecto. Deben coincidir con DEFAULT_SETTINGS de apps/backend/src/analytics.js
// (tests/settings.test.mjs lo verifica, para que nadie cambie uno y olvide el otro).
export const DEFAULT_SETTINGS = { inactivity_days: 5, compensation_alert_pct: 30 };

// Los inputs manejan texto; el servidor espera enteros. Devuelve null si algún valor no es un entero.
export function toSettingsPayload(values) {
  const inactivity_days = Number(values.inactivity_days);
  const compensation_alert_pct = Number(values.compensation_alert_pct);
  return Number.isInteger(inactivity_days) && Number.isInteger(compensation_alert_pct) && String(values.inactivity_days).trim() !== "" && String(values.compensation_alert_pct).trim() !== ""
    ? { inactivity_days, compensation_alert_pct }
    : null;
}

export const settingsToValues = (s) => ({ inactivity_days: String(s.inactivity_days), compensation_alert_pct: String(s.compensation_alert_pct) });
