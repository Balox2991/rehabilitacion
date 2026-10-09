import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMOS, arcGeometry, hasDemo } from "../src/demos/demos.js";
import { LIBRARY } from "../../backend/src/content/library.js"; // contenido de datos puro: garantiza que ficha y animación coinciden

const angleFromLabel = (label) => Number(label.match(/(\d+)°/)[1]);

test("las demostraciones con cámara terminan EXACTAMENTE en la meta del plan (misma definición de ángulo que la medición)", () => {
  for (const [key, target] of [["knee_flexion", 90], ["knee_flexion", 100], ["elbow_flexion", 60], ["elbow_flexion", 45], ["shoulder_flexion", 150], ["shoulder_flexion", 120], ["straight_leg_raise", 45], ["straight_leg_raise", 30]]) {
    const d = DEMOS[key];
    const [, end] = d.range(target);
    assert.equal(angleFromLabel(d.frame(end).label), target, `${key} con meta ${target}`);
  }
});

test("las demostraciones con cámara empiezan cerca del reposo del motor (rodilla y codo extendidos, brazo abajo)", () => {
  const start = (key) => angleFromLabel(DEMOS[key].frame(DEMOS[key].range()[0]).label);
  assert.ok(start("knee_flexion") >= 165, "rodilla casi extendida");
  assert.ok(start("elbow_flexion") >= 165, "codo casi extendido");
  assert.ok(start("shoulder_flexion") <= 20, "brazo pegado al cuerpo");
  assert.ok(start("straight_leg_raise") <= 5, "pierna apoyada en la camilla");
});

test("cada frame tiene huesos, mobiliario y coordenadas finitas (nada de NaN en el SVG)", () => {
  for (const [key, d] of Object.entries(DEMOS)) {
    const [a, b] = d.range();
    for (const v of [a, (a + b) / 2, b]) {
      const f = d.frame(v);
      assert.ok(f.bones.length >= 2 && f.furniture.length >= 1, key);
      const nums = f.bones.flatMap((x) => [x.a.x, x.a.y, x.b.x, x.b.y]).concat(f.joints.flatMap((j) => [j.x, j.y]));
      assert.ok(nums.every(Number.isFinite), `${key} v=${v}`);
      assert.ok(f.bones.some((x) => x.role === "move"), `${key} debe tener al menos un hueso que se mueve`);
      if (f.head) assert.ok(Number.isFinite(f.head.x) && Number.isFinite(f.head.y));
    }
  }
});

test("todo lo dibujado cabe en el lienzo de 320×220", () => {
  for (const [key, d] of Object.entries(DEMOS)) {
    const [a, b] = d.range();
    for (const v of [a, b]) {
      const f = d.frame(v);
      const pts = f.bones.flatMap((x) => [x.a, x.b]).concat(f.furniture.flatMap((x) => [x.a, x.b]));
      for (const p of pts) assert.ok(p.x >= 0 && p.x <= 320 && p.y >= 0 && p.y <= 220, `${key}: (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) fuera del lienzo`);
    }
  }
});

test("la biblioteca solo anuncia demostraciones que existen, y las de cámara coinciden con el motor", () => {
  for (const item of LIBRARY) {
    if (item.demo) assert.ok(hasDemo(item.demo), `${item.code} apunta a la demo inexistente "${item.demo}"`);
    if (item.tracked_exercise_code) {
      assert.equal(DEMOS[item.demo]?.tracked, true, `${item.code} se mide con cámara: su demo debe marcarse tracked`);
      assert.equal(item.demo, item.tracked_exercise_code);
    }
  }
  for (const [key, d] of Object.entries(DEMOS)) assert.ok(LIBRARY.some((i) => i.demo === key), `la demo "${key}" no la usa ningún ejercicio`);
});

test("arcGeometry marca siempre el ángulo interior", () => {
  const b = { x: 0, y: 0 };
  const g = arcGeometry({ a: { x: 10, y: 0 }, b, c: { x: 0, y: 10 } }); // 90°
  assert.match(g.d, /^M .* A 26 26 0 0 1 /); // sentido horario en pantalla
  const g2 = arcGeometry({ a: { x: 0, y: 10 }, b, c: { x: 10, y: 0 } });
  assert.match(g2.d, /A 26 26 0 0 0 /); // el mismo ángulo recorrido al revés
  assert.ok(Number.isFinite(g.labelAt.x) && Number.isFinite(g.labelAt.y));
});
