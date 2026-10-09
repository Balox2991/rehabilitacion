import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_ADVICE_TEXT, bodyPartOf, exerciseOf, setupTips } from "../src/lib/exercise.js";
import { SPECS } from "../../tracking-prototype/src/exerciseSpecs.js";
import { viewAdvice } from "../../tracking-prototype/src/viewCheck.js";

test("exerciseOf arma el ejercicio a partir de la especificación que manda el servidor", () => {
  const spec = { code: "straight_leg_raise", label: "Elevación de pierna recta", joint: "rodilla", bodyPart: "pierna", measure: { type: "segment_angle", from: "hip", to: "knee", reference: "horizontal" }, direction: "increasing", rest: 0, target: 45, view: "profile", posture: "supine" };
  const ex = exerciseOf({ exercise_code: "straight_leg_raise", spec });
  assert.equal(ex.kind, "segment");
  assert.equal(ex.reference, "horizontal");
  assert.equal(ex.getPoints(Array.from({ length: 33 }, (_, i) => ({ x: i })), "left").length, 2);
});

test("un ejercicio NUEVO que solo existe en la base (no en el código) se puede medir: la pantalla no necesita conocerlo", () => {
  const spec = { code: "ejercicio_nuevo", label: "Nuevo", joint: "codo", measure: { type: "joint_angle", points: ["shoulder", "elbow", "wrist"] }, direction: "decreasing", rest: 170, target: 80, view: "front", posture: "standing" };
  const ex = exerciseOf({ exercise_code: "ejercicio_nuevo", spec });
  assert.equal(ex.id, "ejercicio_nuevo");
  assert.equal(ex.view, "front");
});

test("sin especificación del servidor se usa la del catálogo local, y un ejercicio desconocido da un error claro", () => {
  assert.equal(exerciseOf({ exercise_code: "knee_flexion" }).kind, "joint");
  assert.throws(() => exerciseOf({ exercise_code: "no_existe" }), /No se sabe cómo medir/);
  assert.throws(() => exerciseOf({ exercise_code: "x", spec: { code: "x" } }), /inválido/);
});

test("las indicaciones de colocación siguen la postura y la vista de cada ejercicio", () => {
  const sit = setupTips(exerciseOf({ exercise_code: "knee_flexion" }));
  assert.ok(sit.some((t) => /silla/.test(t)) && sit.some((t) => /perfil/.test(t)));
  const stand = setupTips(exerciseOf({ exercise_code: "shoulder_flexion" }));
  assert.ok(stand.some((t) => /Párate/.test(t)) && stand.some((t) => /de frente/.test(t)));
  const lie = setupTips(exerciseOf({ exercise_code: "straight_leg_raise" }));
  assert.ok(lie.some((t) => /boca arriba/.test(t)) && lie.some((t) => /de la cadera a la rodilla/.test(t)));
  for (const s of SPECS) assert.ok(setupTips(exerciseOf({ exercise_code: s.code })).length >= 4, s.code);
});

test("cada código de aviso de vista tiene su frase", () => {
  for (const code of ["turn_profile", "turn_front"]) assert.ok(VIEW_ADVICE_TEXT[code].length > 20);
  assert.equal(viewAdvice("profile", { view: "front" }) in VIEW_ADVICE_TEXT, true);
  assert.equal(viewAdvice("front", { view: "profile" }) in VIEW_ADVICE_TEXT, true);
});

test("bodyPartOf: «pierna» para la elevación de pierna, y la articulación para el resto", () => {
  assert.equal(bodyPartOf(exerciseOf({ exercise_code: "straight_leg_raise" })), "pierna");
  assert.equal(bodyPartOf(exerciseOf({ exercise_code: "knee_flexion" })), "rodilla");
  assert.equal(bodyPartOf({ joint: "codo" }), "codo");
});
