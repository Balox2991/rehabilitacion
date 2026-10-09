import test from "node:test";
import assert from "node:assert/strict";
import { ANALYZER_VERSION, THRESHOLDS, analyzeSession, findPeaks, flagsDuring } from "../src/analysis.js";
import { medianCentered, zeroPhaseOneEuro } from "../src/signalFilter.js";
import { generateReps, rng } from "./helpers/signals.mjs";

const trace = (samples, { vis = 1, flags = [], meta = {} } = {}) => ({
  format: "telerehab-trace/2",
  meta: { exercise: "knee_flexion", side: "right", targetAngle: 90, restAngle: 175, direction: "decreasing", ...meta },
  t: samples.map((s) => s[1]),
  angle: samples.map((s) => s[0]),
  vis: samples.map((_, i) => (typeof vis === "function" ? vis(i) : vis)),
  flags,
});
const codes = (r) => r.suggestions.map((s) => s.code);
const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} no está a ±${tol} de ${b}`);

test("cuenta y mide cada repetición: ROM del extremo con error ≤ 3° incluso con ruido de ±3° (promedio < 1,2°)", () => {
  const r = analyzeSession(trace(generateReps({ reps: 10, restAngle: 175, peakAngle: 85, noiseSd: 3, seed: 5 })));
  assert.equal(r.summary.count, 10);
  assert.equal(r.reps.length, 10);
  for (const rep of r.reps) near(rep.angle, 85, 3, `rep ${rep.n}`);
  assert.ok(r.reps.reduce((s, x) => s + Math.abs(x.angle - 85), 0) / r.reps.length < 1.2);
  near(r.summary.rom.mean, 95, 2); // 180 − 85 = 95° de flexión
  assert.equal(r.analyzer_version, ANALYZER_VERSION);
});

test("el análisis posterior mide el extremo MEJOR que el contador en vivo (sin el retraso del filtro causal)", async () => {
  const { RepCounter } = await import("../src/repCounter.js");
  const samples = generateReps({ reps: 12, restAngle: 175, peakAngle: 80, holdMs: 600, noiseSd: 3, seed: 3 });
  const live = new RepCounter({ targetAngle: 90, restAngle: 175, direction: "decreasing" });
  const liveRoms = [];
  for (const [a, t] of samples) if (live.update(a, t).repCompleted) liveRoms.push(live.lastRomAchieved);
  const offline = analyzeSession(trace(samples)).reps.map((x) => x.angle);
  const err = (xs) => xs.reduce((s, x) => s + Math.abs(x - 80), 0) / xs.length;
  assert.equal(offline.length, 12);
  assert.ok(err(offline) < err(liveRoms), `posterior ${err(offline).toFixed(2)}° vs en vivo ${err(liveRoms).toFixed(2)}°`);
});

test("paciente que no llega a la meta: cuenta todo y lo señala (sin culparlo)", () => {
  const r = analyzeSession(trace(generateReps({ reps: 8, restAngle: 175, peakAngle: 108, noiseSd: 2, seed: 2 })));
  assert.equal(r.summary.count, 8);
  assert.equal(r.summary.reached_target, 0);
  assert.ok(codes(r).includes("target_not_reached"));
  assert.ok(!codes(r).includes("no_reps"));
});

test("llegar a la meta se reconoce con tolerancia de 8°", () => {
  const r = analyzeSession(trace(generateReps({ reps: 6, restAngle: 175, peakAngle: 88, seed: 1 })));
  assert.equal(r.summary.reached_target, 6);
  assert.ok(!codes(r).includes("target_not_reached"));
});

test("tempo: subida, sostén y bajada coinciden con lo generado (10–90 %, sostén arriba del 90 %)", () => {
  // moveMs 900 con coseno: de 10 % a 90 % ≈ 531 ms; sostén 800 ms + 2 × ~184 ms arriba del 90 %
  const r = analyzeSession(trace(generateReps({ reps: 8, restAngle: 175, peakAngle: 85, moveMs: 900, holdMs: 800, pauseMs: 700 })));
  near(r.summary.tempo.up_s, 0.53, 0.12, "subida");
  near(r.summary.tempo.down_s, 0.53, 0.12, "bajada");
  near(r.summary.tempo.hold_s, 1.17, 0.25, "sostén");
  near(r.summary.tempo.cycle_s, (900 + 800 + 900 + 700) / 1000, 0.1, "ciclo");
  assert.ok(r.summary.tempo.cycle_cv_pct < 5);
});

test("fatiga: el recorrido cae a lo largo de la sesión y se avisa", () => {
  const r = analyzeSession(trace(generateReps({ reps: 12, restAngle: 175, peakAngle: 85, fatigue: 0.35, noiseSd: 1.5, seed: 4 })));
  assert.equal(r.summary.count, 12);
  assert.ok(r.summary.rom.drop_pct >= THRESHOLDS.fatigueDropPct, `caída ${r.summary.rom.drop_pct} %`);
  assert.ok(codes(r).includes("fatigue"));
});

test("una sesión pareja no dispara fatiga y termina con una nota positiva", () => {
  const r = analyzeSession(trace(generateReps({ reps: 12, restAngle: 175, peakAngle: 85, moveMs: 1300, holdMs: 800, noiseSd: 1.5, seed: 4 })), { holdSeconds: 2 });
  assert.ok(!codes(r).includes("fatigue"));
  assert.ok(codes(r).includes("well_done"), codes(r).join(","));
});

test("movimientos muy rápidos se señalan por separado (subida y bajada)", () => {
  const r = analyzeSession(trace(generateReps({ reps: 10, restAngle: 175, peakAngle: 85, moveMs: 450, holdMs: 0, pauseMs: 300, seed: 6 })));
  assert.equal(r.summary.count, 10);
  assert.ok(codes(r).includes("fast_up") && codes(r).includes("fast_down"));
});

test("sostén corto frente al prescrito se avisa solo si el ejercicio pide sostén", () => {
  const samples = generateReps({ reps: 8, restAngle: 175, peakAngle: 85, moveMs: 1200, holdMs: 0, pauseMs: 600 });
  assert.ok(codes(analyzeSession(trace(samples), { holdSeconds: 5 })).includes("short_hold"));
  assert.ok(!codes(analyzeSession(trace(samples))).includes("short_hold"));
});

test("ritmo irregular (pausas muy distintas entre repeticiones) se detecta", () => {
  const r0 = rng(3);
  let t = 0;
  const samples = [];
  for (let rep = 0; rep < 8; rep++) {
    const pause = rep % 2 ? 7000 : 300;
    for (const [a, tt] of generateReps({ reps: 1, restAngle: 175, peakAngle: 85, leadMs: pause, moveMs: 900, holdMs: 400, pauseMs: 0, seed: 10 + rep })) samples.push([a, tt + t]);
    t = samples[samples.length - 1][1] + 33;
    void r0;
  }
  const r = analyzeSession(trace(samples));
  assert.ok(r.summary.tempo.cycle_cv_pct > THRESHOLDS.irregularCyclePct, `CV ${r.summary.tempo.cycle_cv_pct} %`);
  assert.ok(codes(r).includes("irregular_rhythm"));
});

test("poca visibilidad: lo avisa y no usa las lecturas tapadas", () => {
  const samples = generateReps({ reps: 8, restAngle: 175, peakAngle: 90, seed: 1 });
  const hidden = (i) => (i % 3 === 0 ? 0.1 : 1); // un tercio de las lecturas, tapadas (y su ángulo sería basura)
  const t = trace(samples.map(([a, tt], i) => [hidden(i) < 0.5 ? 20 : a, tt]), { vis: hidden });
  const r = analyzeSession(t);
  assert.equal(r.visible_pct, 67);
  assert.ok(codes(r).includes("low_visibility"));
  assert.equal(r.summary.count, 8); // las lecturas tapadas (ángulo basura) no cuentan repeticiones falsas
});

test("una repetición que cruza un hueco largo de visibilidad se descarta y se cuenta aparte", () => {
  const samples = generateReps({ reps: 6, restAngle: 175, peakAngle: 90, seed: 1 });
  const t = trace(samples, { vis: (i) => (samples[i][1] > 6500 && samples[i][1] < 9500 ? 0.1 : 1) });
  const r = analyzeSession(t);
  assert.ok(r.summary.interrupted >= 1);
  assert.ok(r.summary.count < 6);
  assert.ok(codes(r).includes("interrupted"));
});

test("las alertas de postura se asignan a la repetición en la que ocurrieron", () => {
  const samples = generateReps({ reps: 5, restAngle: 175, peakAngle: 90 });
  const base = analyzeSession(trace(samples));
  const target = base.reps[2];
  const mid = ((target.t_start_s + target.t_end_s) / 2) * 1000 + samples[0][1];
  const r = analyzeSession(trace(samples, { flags: [[0, []], [Math.round(mid - 100), ["Inclinación de tronco"]], [Math.round(mid + 100), []]] }));
  assert.deepEqual(r.reps.map((x) => x.flags.length), [0, 0, 1, 0, 0]);
  assert.equal(r.summary.flagged_reps, 1);
  assert.equal(r.summary.flagged_pct, 20);
});

test("muchas repeticiones con alerta de postura generan la sugerencia", () => {
  const samples = generateReps({ reps: 6, restAngle: 175, peakAngle: 90 });
  const r = analyzeSession(trace(samples, { flags: [[0, ["Elevación de cadera"]]] }));
  assert.equal(r.summary.flagged_pct, 100);
  assert.ok(codes(r).includes("posture"));
});

test("hizo menos de la mitad de lo prescrito: se avisa", () => {
  const r = analyzeSession(trace(generateReps({ reps: 4, restAngle: 175, peakAngle: 90 })), { expectedReps: 30 });
  assert.ok(codes(r).includes("incomplete"));
});

test("sesión sin movimiento o casi vacía no revienta y lo dice", () => {
  const still = analyzeSession(trace(generateReps({ reps: 0, restAngle: 140, peakAngle: 140, noiseSd: 3, leadMs: 10000, spikeProb: 0.04, seed: 2 })));
  assert.equal(still.summary.count, 0);
  assert.ok(codes(still).includes("no_reps"));
  const empty = analyzeSession({ meta: { direction: "decreasing", targetAngle: 90, restAngle: 175 }, t: [], angle: [], vis: [], flags: [] });
  assert.equal(empty.summary.count, 0);
  assert.equal(empty.duration_s, 0);
  assert.ok(codes(empty).includes("no_reps"));
});

test("reposo ruidoso con picos aislados no inventa repeticiones (30 señales)", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = analyzeSession(trace(generateReps({ reps: 0, restAngle: 130, peakAngle: 130, noiseSd: 4, spikeProb: 0.05, leadMs: 15000, seed })));
    assert.equal(r.summary.count, 0, `semilla ${seed}`);
  }
});

test("exacto en 30 señales con ruido ±3,5° y picos del 4 % (paciente en recuperación y persona sana)", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const peakAngle = seed % 2 ? 108 : 82;
    const r = analyzeSession(trace(generateReps({ reps: 10, restAngle: 172, peakAngle, noiseSd: 3.5, spikeProb: 0.04, seed: 200 + seed })));
    assert.equal(r.summary.count, 10, `semilla ${seed}: contó ${r.summary.count}`);
  }
});

test("hombro (dirección contraria) y tasas de cuadros bajas", () => {
  const meta = { exercise: "shoulder_flexion", direction: "increasing", targetAngle: 150, restAngle: 15 };
  for (const fps of [10, 15, 30]) {
    const r = analyzeSession(trace(generateReps({ reps: 8, restAngle: 15, peakAngle: 120, fps, jitterMs: 12, dropProb: 0.1, noiseSd: 2.5, seed: 9 }), { meta }));
    assert.equal(r.summary.count, 8, `${fps} fps`);
    near(r.reps[3].angle, 120, 3, "hombro");
    assert.equal(r.reps[3].flexion, r.reps[3].angle); // en hombro, flexión = ángulo
  }
});

test("los tiempos de cada repetición son crecientes y coherentes", () => {
  const r = analyzeSession(trace(generateReps({ reps: 6, restAngle: 175, peakAngle: 90, seed: 1 })));
  for (const rep of r.reps) assert.ok(rep.t_start_s < rep.t_peak_s && rep.t_peak_s < rep.t_end_s);
  for (let i = 1; i < r.reps.length; i++) assert.ok(r.reps[i].t_start_s >= r.reps[i - 1].t_peak_s);
});

test("findPeaks: ignora el rebote pequeño sobre un pico grande y exige prominencia", () => {
  const s = [0, 10, 30, 50, 45, 52, 30, 10, 0, 3, 0];
  const p = findPeaks(s, 20);
  assert.deepEqual(p.map((x) => x.index), [5]); // 50 y 52 son la misma cima (valle de solo 5°)
  assert.equal(findPeaks([0, 5, 0, 6, 0], 20).length, 0);
});

test("flagsDuring: cada estado vale hasta el siguiente evento", () => {
  const ev = [[0, []], [1000, ["A"]], [2000, ["B"]], [3000, []]];
  assert.deepEqual(flagsDuring(ev, 500, 900), []);
  assert.deepEqual(flagsDuring(ev, 900, 1100), ["A"]);
  assert.deepEqual(flagsDuring(ev, 1500, 2500).sort(), ["A", "B"]);
  assert.deepEqual(flagsDuring(ev, 3500, 4000), []);
  assert.deepEqual(flagsDuring(undefined, 0, 10), []);
});

test("medianCentered y zeroPhaseOneEuro: sin retraso en una rampa y menos ruido en reposo", () => {
  assert.deepEqual(medianCentered([100, 100, 40, 100, 100], 5), [100, 100, 100, 100, 100]);
  const ts = Array.from({ length: 60 }, (_, i) => i * 33);
  const ramp = ts.map((t) => 90 * (t / 1000));
  const sm = zeroPhaseOneEuro(ts, ramp);
  near(sm[30], ramp[30], 1.5, "a mitad de la rampa"); // un filtro causal iría varios grados atrás
  const r = rng(1);
  const tl = Array.from({ length: 400 }, (_, i) => i * 33);
  const noisy = tl.map(() => 120 + (r() - 0.5) * 10);
  const out = zeroPhaseOneEuro(tl, noisy);
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  assert.ok(sd(out.slice(15)) < sd(noisy.slice(15)) / 2); // se ignora el arranque del filtro: parte del primer valor, que trae ruido
});

test("terminar a mitad de la bajada: esa última repetición SÍ cuenta (coincide con lo que vio contar en vivo)", () => {
  const full = generateReps({ reps: 5, restAngle: 175, peakAngle: 88, holdMs: 400, seed: 3 });
  const rep5 = analyzeSession(trace(full)).reps[4];
  const halfDown = (rep5.t_end_s - rep5.down_s / 2) * 1000; // ya bajó, pero aún no llega al reposo
  assert.equal(analyzeSession(trace(full.filter(([, t]) => t <= halfDown))).summary.count, 5);
  const stillHolding = (rep5.t_peak_s - 0.1) * 1000; // todavía sostiene arriba: nadie la contó en vivo tampoco
  assert.equal(analyzeSession(trace(full.filter(([, t]) => t <= stillHolding))).summary.count, 4);
});

test("findPeaks: un pico cortado por el final solo cuenta si ya bajó lo suficiente", () => {
  const s = [0, 10, 30, 55, 70, 69, 66, 60];
  assert.equal(findPeaks(s, 25).length, 0);
  assert.equal(findPeaks(s, 25, { rightEdgeDrop: () => 8 }).length, 1);
  assert.equal(findPeaks(s, 25, { rightEdgeDrop: () => 20 }).length, 0);
});
