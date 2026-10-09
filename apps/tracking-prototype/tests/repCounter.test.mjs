import test from "node:test";
import assert from "node:assert/strict";
import { RepCounter, RepState } from "../src/repCounter.js";
import { generateReps, run } from "./helpers/signals.mjs";

const knee = (over = {}) => new RepCounter({ targetAngle: 90, restAngle: 175, direction: "decreasing", ...over });
const shoulder = (over = {}) => new RepCounter({ targetAngle: 150, restAngle: 15, direction: "increasing", ...over });
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} no está a ±${tol} de ${b}`);

test("cuenta repeticiones limpias: rodilla de 175° a 85° y de vuelta", () => {
  const out = run(knee(), generateReps({ reps: 10, restAngle: 175, peakAngle: 85 }));
  assert.equal(out.length, 10);
});

test("PACIENTE EN RECUPERACIÓN: cuenta las repeticiones aunque NO llegue a la meta (la versión 1 contaba 0)", () => {
  // Meta 90°, pero solo alcanza 105° (≈ 70° de flexión): 10 repeticiones reales.
  const counter = knee();
  const out = run(counter, generateReps({ reps: 10, restAngle: 175, peakAngle: 105 }));
  assert.equal(out.length, 10);
  assert.equal(counter.lastReachedTarget, false); // no llegó, y se sabe, pero la repetición cuenta
  near(counter.lastRomAchieved, 105, 3);
});

test("no depende de un reposo calibrado: reposo real de 160° en vez de 175°", () => {
  assert.equal(run(knee(), generateReps({ reps: 8, restAngle: 160, peakAngle: 100 })).length, 8);
});

test("no exige volver al reposo: repeticiones que oscilan entre 60° y 100° de flexión se cuentan todas", () => {
  // valle en 120° (60° de flexión) y pico en 80° (100° de flexión)
  assert.equal(run(knee(), generateReps({ reps: 8, restAngle: 120, peakAngle: 80 })).length, 8);
});

test("registra el ROM realmente alcanzado, no el ruido: error ≤ 3° con ruido de ±3°", () => {
  const counter = knee();
  const out = run(counter, generateReps({ reps: 10, restAngle: 175, peakAngle: 82, noiseSd: 3, seed: 3 }));
  assert.equal(out.length, 10);
  for (const r of out) near(r.rom, 82, 3);
});

test("ruido ±3° y picos aislados de 40° en el 5 % de los frames: cuenta exacto en 20 señales distintas", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const out = run(knee(), generateReps({ reps: 12, restAngle: 175, peakAngle: 85, noiseSd: 3, spikeProb: 0.05, seed }));
    assert.equal(out.length, 12, `semilla ${seed}: contó ${out.length}`);
  }
});

test("paciente con ruido y pocas ganas de llegar a la meta (peak 110°): también exacto", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const out = run(knee(), generateReps({ reps: 10, restAngle: 172, peakAngle: 110, noiseSd: 3.5, spikeProb: 0.04, seed: 100 + seed }));
    assert.equal(out.length, 10, `semilla ${seed}: contó ${out.length}`);
  }
});

test("quieto (solo ruido y picos): cero repeticiones, incluso parado justo en la meta", () => {
  for (const rest of [175, 100, 90]) {
    for (let seed = 1; seed <= 10; seed++) {
      const out = run(knee(), generateReps({ reps: 0, restAngle: rest, peakAngle: rest, noiseSd: 4, spikeProb: 0.05, seed, leadMs: 20000 }));
      assert.equal(out.length, 0, `reposo ${rest}°, semilla ${seed}: contó ${out.length}`);
    }
  }
});

test("un movimiento pequeño (temblor de 10°) no es una repetición y se anota como descartado", () => {
  const counter = knee();
  const out = run(counter, generateReps({ reps: 6, restAngle: 175, peakAngle: 165 }));
  assert.equal(out.length, 0);
});

test("sostener arriba 2,5 s con ruido cuenta UNA repetición, no varias", () => {
  const out = run(knee(), generateReps({ reps: 5, restAngle: 175, peakAngle: 88, holdMs: 2500, noiseSd: 3, seed: 5 }));
  assert.equal(out.length, 5);
});

test("repeticiones lentas (3,5 s por tramo) y rápidas (0,5 s por tramo) se cuentan igual", () => {
  assert.equal(run(knee(), generateReps({ reps: 6, restAngle: 175, peakAngle: 90, moveMs: 3500, holdMs: 800, seed: 2, noiseSd: 2 })).length, 6);
  assert.equal(run(knee(), generateReps({ reps: 10, restAngle: 175, peakAngle: 90, moveMs: 500, holdMs: 0, pauseMs: 200, seed: 2, noiseSd: 2 })).length, 10);
});

test("fps irregular (cámara lenta, intervalos variables y frames perdidos) no cambia el conteo", () => {
  for (const fps of [10, 15, 30]) {
    const out = run(knee(), generateReps({ reps: 8, restAngle: 175, peakAngle: 90, fps, jitterMs: 15, dropProb: 0.15, noiseSd: 2.5, seed: 9 }));
    assert.equal(out.length, 8, `${fps} fps: contó ${out.length}`);
  }
});

test("dirección 'increasing' (flexión de hombro): reposo bajo, objetivo alto, también con quien no llega", () => {
  assert.equal(run(shoulder(), generateReps({ reps: 8, restAngle: 15, peakAngle: 148, noiseSd: 3, spikeProb: 0.04, seed: 4 })).length, 8);
  const c = shoulder();
  assert.equal(run(c, generateReps({ reps: 8, restAngle: 15, peakAngle: 95, noiseSd: 3, seed: 4 })).length, 8);
  assert.equal(c.lastReachedTarget, false);
  near(c.lastRomAchieved, 95, 4);
});

test("un rebote arriba (sube, baja un poco, vuelve a subir) es UNA repetición", () => {
  const counter = knee();
  const t = (a, s) => [a, s];
  // 175 → 90 → 100 (rebote de 10°) → 88 → 175
  const path = [[175, 0], [175, 400], [150, 800], [120, 1200], [90, 1600], [92, 1800], [100, 2000], [92, 2200], [88, 2400], [88, 2700], [130, 3200], [175, 3700], [175, 4200]];
  const out = [];
  for (let k = 0; k < path.length - 1; k++) {
    const [a0, t0] = path[k], [a1, t1] = path[k + 1];
    for (let tt = t0; tt < t1; tt += 33) {
      const o = counter.update(a0 + ((a1 - a0) * (tt - t0)) / (t1 - t0), tt);
      if (o.repCompleted) out.push(tt);
    }
  }
  assert.equal(out.length, 1);
});

test("ignora lecturas inválidas (NaN, undefined) sin perder la cuenta ni romperse", () => {
  const counter = knee();
  const samples = generateReps({ reps: 4, restAngle: 175, peakAngle: 90 });
  const dirty = samples.flatMap((s, i) => (i % 7 === 0 ? [[NaN, s[1]], s] : [s]));
  const out = run(counter, dirty);
  assert.equal(out.length, 4);
  assert.doesNotThrow(() => counter.update(undefined, 1e6));
});

test("una pausa larga de la cámara (pestaña en segundo plano) no inventa repeticiones", () => {
  const counter = knee();
  const first = generateReps({ reps: 3, restAngle: 175, peakAngle: 90 });
  const last = first[first.length - 1][1];
  const second = generateReps({ reps: 3, restAngle: 175, peakAngle: 90 }).map(([a, t]) => [a, t + last + 60000]);
  assert.equal(run(counter, [...first, ...second]).length, 6);
});

test("inTarget indica si AHORA está en el rango de la meta, y state expone el movimiento", () => {
  const counter = knee();
  assert.equal(counter.inTarget, false);
  const samples = generateReps({ reps: 1, restAngle: 175, peakAngle: 85 });
  let sawTarget = false, sawMoving = false;
  for (const [a, t] of samples) {
    const o = counter.update(a, t);
    sawTarget ||= o.inTarget;
    sawMoving ||= o.state === RepState.MOVING;
  }
  assert.ok(sawTarget && sawMoving);
  assert.equal(counter.inTarget, false); // volvió al reposo
});

test("update devuelve el ángulo suavizado (más estable que el crudo) para mostrarlo en pantalla", () => {
  const counter = knee();
  let maxRaw = 0, maxSmooth = 0, prevRaw = null, prevSmooth = null;
  for (const [a, t] of generateReps({ reps: 0, restAngle: 130, peakAngle: 130, noiseSd: 4, seed: 11, leadMs: 10000 })) {
    const o = counter.update(a, t);
    if (o.angle == null) continue; // calentamiento del filtro
    if (prevRaw !== null) { maxRaw = Math.max(maxRaw, Math.abs(a - prevRaw)); maxSmooth = Math.max(maxSmooth, Math.abs(o.angle - prevSmooth)); }
    prevRaw = a; prevSmooth = o.angle;
  }
  assert.ok(maxSmooth < maxRaw / 2, `suavizado ${maxSmooth.toFixed(1)}° vs crudo ${maxRaw.toFixed(1)}°`);
});

test("un pico en las primeras lecturas (antes de que el filtro se caliente) no inventa una repetición", () => {
  const counter = knee();
  counter.update(150, 0); // un frame equivocado justo al arrancar (el cuerpo real está en 100°)
  const out = run(counter, generateReps({ reps: 0, restAngle: 100, peakAngle: 100, noiseSd: 3, leadMs: 15000, seed: 2 }));
  assert.equal(out.length, 0);
});

test("reset deja el contador como nuevo", () => {
  const counter = knee();
  run(counter, generateReps({ reps: 3, restAngle: 175, peakAngle: 90 }));
  counter.reset();
  assert.equal(counter.reps, 0);
  assert.equal(counter.lastRomAchieved, null);
  assert.equal(run(counter, generateReps({ reps: 2, restAngle: 175, peakAngle: 90 })).length, 2);
});
