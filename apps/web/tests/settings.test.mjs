import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, settingsToValues, toSettingsPayload } from "../src/lib/settings.js";
import { DEFAULT_SETTINGS as BACKEND_DEFAULTS } from "../../backend/src/analytics.js";

test("los umbrales por defecto del frontend son los mismos que los del backend", () => {
  assert.deepEqual(DEFAULT_SETTINGS, BACKEND_DEFAULTS);
});

test("toSettingsPayload convierte texto a enteros y rechaza vacíos y decimales", () => {
  assert.deepEqual(toSettingsPayload({ inactivity_days: "7", compensation_alert_pct: "40" }), { inactivity_days: 7, compensation_alert_pct: 40 });
  assert.equal(toSettingsPayload({ inactivity_days: "", compensation_alert_pct: "40" }), null, "vacío no es 0");
  assert.equal(toSettingsPayload({ inactivity_days: "5.5", compensation_alert_pct: "40" }), null);
  assert.equal(toSettingsPayload({ inactivity_days: "abc", compensation_alert_pct: "40" }), null);
  assert.deepEqual(settingsToValues({ inactivity_days: 5, compensation_alert_pct: 30 }), { inactivity_days: "5", compensation_alert_pct: "30" });
});
