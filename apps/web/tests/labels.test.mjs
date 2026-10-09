import { test } from "node:test";
import assert from "node:assert/strict";
import { angleFromFlexion, flexionFromAngle } from "../src/lib/rom.js";
import { PHASES, PHASE_ORDER, areaLabel, difficultyLabel, dosage, evidenceId, phaseLabel } from "../src/lib/labels.js";

test("el orden de fases coincide con el del backend", () => {
  assert.deepEqual(PHASE_ORDER, ["proteccion", "movilidad", "fortalecimiento", "funcional"]);
  for (const p of PHASE_ORDER) assert.ok(PHASES[p].label && PHASES[p].hint);
});

test("etiquetas con valores desconocidos no rompen la pantalla", () => {
  assert.equal(phaseLabel(null), "Sin definir");
  assert.equal(areaLabel("muneca"), "Muñeca");
  assert.equal(areaLabel("nuevo"), "nuevo");
  assert.equal(difficultyLabel(2), "Moderado");
  assert.equal(difficultyLabel(9), "");
});

test("dosage describe series, repeticiones y tiempo de sostén", () => {
  assert.equal(dosage({ sets: 3, reps: 10, hold_seconds: 5 }), "3 series de 10 · sostener 5 s");
  assert.equal(dosage({ sets: 1, reps: 10, hold_seconds: null }), "1 serie de 10");
  assert.equal(dosage({ sets: 3, reps: 1, hold_seconds: 45 }), "3 series de 45 s");
});

test("evidenceId prefiere PMID, luego DOI, luego la fuente", () => {
  assert.equal(evidenceId({ pmid: "1", doi: "x", source: "s" }), "PMID 1");
  assert.equal(evidenceId({ pmid: null, doi: "10.1/x", source: "s" }), "DOI 10.1/x");
  assert.equal(evidenceId({ pmid: null, doi: null, source: "arXiv:2006.10204" }), "arXiv:2006.10204");
});

test("flexión ↔ ángulo son inversas en ambas direcciones", () => {
  for (const dir of ["decreasing", "increasing"]) for (const f of [0, 45, 90, 150]) assert.equal(flexionFromAngle(dir, angleFromFlexion(dir, f)), f);
  assert.equal(angleFromFlexion("decreasing", 90), 90); // meta de rodilla: 90° de flexión = ángulo interno 90°
  assert.equal(angleFromFlexion("decreasing", 120), 60); // codo: 120° de flexión = ángulo interno 60°
});
