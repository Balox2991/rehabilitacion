#!/usr/bin/env node
/**
 * evaluate.mjs — evaluación reproducible del conteo y la medición de repeticiones con señales SINTÉTICAS de verdad conocida.
 *
 * Qué es: una simulación Monte Carlo. Se generan sesiones donde se sabe cuántas repeticiones hubo y hasta qué ángulo llegó cada una,
 * se les añade el tipo de error que tiene una cámara (ruido, picos aislados, cuadros perdidos, tiempos irregulares) y se mide qué tan
 * bien las recupera cada método. Es determinista (semillas fijas): la misma ejecución da los mismos números.
 *
 * Qué NO es: una validación con personas ni con un goniómetro. Las señales son simuladas; mide la lógica de conteo/medición ante
 * ruido, no la precisión del modelo de pose (MediaPipe) con cuerpos reales. Esa validación es una tarea pendiente (ver cronograma).
 *
 * Métodos comparados:
 *   - base:   línea base ingenua (cruce de un umbral fijo en el punto medio entre reposo y meta, sobre la señal cruda).
 *             Se escribió solo para esta comparación; NO es el código de la Fase 1.
 *   - vivo:   RepCounter (mediana + One Euro causal + valle/pico), lo que ve el paciente mientras hace el ejercicio.
 *   - posterior: analyzeSession (filtro de fase cero + prominencia + estimador de meseta), lo que se guarda como dato oficial.
 *
 * Uso: node scripts/evaluate.mjs [--json salida.json] [--n 200]
 */
import { writeFileSync } from "node:fs";
import { analyzeSession } from "../src/analysis.js";
import { RepCounter } from "../src/repCounter.js";
import { generateReps, rng } from "../tests/helpers/signals.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const N = Number(opt("--n", 200));
const OUT = opt("--json", null);

const REST = 175; // ángulo interno de la rodilla en reposo (casi extendida)
const TARGET = 90; // meta del plan

const CONDITIONS = [
  { id: "A", name: "Ideal (sin ruido)", gen: { noiseSd: 0 } },
  { id: "B", name: "Ruido σ = 2°", gen: { noiseSd: 2 } },
  { id: "C", name: "Ruido σ = 3° (error típico de cámara)", gen: { noiseSd: 3 } },
  { id: "D", name: "Ruido σ = 5° (cámara en mal ángulo)", gen: { noiseSd: 5 } },
  { id: "E", name: "σ = 3° + picos aislados de 40° (3 % de cuadros)", gen: { noiseSd: 3, spikeProb: 0.03, spikeDeg: 40 } },
  { id: "F", name: "σ = 3° + 15 % de cuadros perdidos + tiempos irregulares", gen: { noiseSd: 3, dropProb: 0.15, jitterMs: 8 } },
  { id: "G", name: "Recorrido limitado (llega a 130° de 90°), σ = 3°", gen: { noiseSd: 3, peakAngle: 130 } },
  { id: "H", name: "Movimiento rápido (0,5 s por fase), σ = 3°", gen: { noiseSd: 3, moveMs: 500, holdMs: 200, pauseMs: 300 } },
  { id: "I", name: "Fatiga (pierde 30 % de recorrido al final), σ = 3°", gen: { noiseSd: 3, fatigue: 0.3 } },
];

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

function baseline(samples) { // cruce descendente del punto medio, señal cruda
  const mid = (REST + TARGET) / 2;
  let below = false, n = 0;
  for (const [a] of samples) {
    if (!below && a < mid) { below = true; n++; }
    else if (below && a > mid + 8) below = false; // pequeña histéresis para no contar el ruido pegado al umbral
  }
  return n;
}

function oneCondition(cond) {
  const r = rng(12345);
  const rows = { base: [], vivo: [], posterior: [] };
  const romErr = { vivo: [], posterior: [] };
  for (let s = 0; s < N; s++) {
    const reps = 6 + Math.floor(r() * 9); // 6 a 14 repeticiones
    const gen = { reps, restAngle: REST, peakAngle: 80, seed: 1000 + s, ...cond.gen };
    const samples = generateReps(gen);
    const truthAt = (k) => REST + (gen.peakAngle - REST) * (1 - (gen.fatigue ?? 0) * (reps > 1 ? k / (reps - 1) : 0));

    rows.base.push(baseline(samples) - reps);

    const live = new RepCounter({ targetAngle: TARGET, restAngle: REST, direction: "decreasing" });
    const liveRoms = [];
    for (const [a, t] of samples) if (live.update(a, t).repCompleted) liveRoms.push(live.lastRomAchieved);
    rows.vivo.push(liveRoms.length - reps);

    const trace = {
      format: "telerehab-trace/2",
      meta: { exercise: "knee_flexion", side: "right", targetAngle: TARGET, restAngle: REST, direction: "decreasing" },
      t: samples.map((x) => x[1]), angle: samples.map((x) => x[0]), vis: samples.map(() => 1), flags: [],
    };
    const post = analyzeSession(trace).reps.map((x) => x.angle);
    rows.posterior.push(post.length - reps);

    // Error de ROM solo en sesiones donde el método contó bien (si no, no se puede emparejar repetición con repetición)
    if (liveRoms.length === reps) romErr.vivo.push(mean(liveRoms.map((v, k) => Math.abs(v - truthAt(k)))));
    if (post.length === reps) romErr.posterior.push(mean(post.map((v, k) => Math.abs(v - truthAt(k)))));
  }
  const stat = (diffs) => ({
    exacto_pct: Math.round((diffs.filter((d) => d === 0).length / diffs.length) * 1000) / 10,
    error_abs_medio: Math.round(mean(diffs.map(Math.abs)) * 100) / 100,
    sesgo: Math.round(mean(diffs) * 100) / 100,
  });
  const rom = (xs) => ({ n: xs.length, error_medio_grados: xs.length ? Math.round(mean(xs) * 100) / 100 : null });
  return { ...cond, sesiones: N, conteo: { base: stat(rows.base), vivo: stat(rows.vivo), posterior: stat(rows.posterior) }, rom: { vivo: rom(romErr.vivo), posterior: rom(romErr.posterior) } };
}

const results = CONDITIONS.map(oneCondition);

const pad = (s, n) => String(s).padEnd(n);
console.log(`Evaluación sintética — ${N} sesiones por condición (6–14 repeticiones cada una), semillas fijas\n`);
console.log(pad("Cond.", 6) + pad("Conteo exacto % (base / vivo / posterior)", 44) + pad("Error abs. medio (reps)", 26) + "Error de ROM (° vivo / posterior)");
for (const r of results) {
  const c = r.conteo;
  console.log(
    pad(r.id, 6) +
      pad(`${c.base.exacto_pct} / ${c.vivo.exacto_pct} / ${c.posterior.exacto_pct}`, 44) +
      pad(`${c.base.error_abs_medio} / ${c.vivo.error_abs_medio} / ${c.posterior.error_abs_medio}`, 26) +
      `${r.rom.vivo.error_medio_grados ?? "—"} / ${r.rom.posterior.error_medio_grados ?? "—"}`,
  );
}
if (OUT) writeFileSync(OUT, JSON.stringify({ generado: "evaluate.mjs", sesiones_por_condicion: N, rest: REST, target: TARGET, resultados: results }, null, 2));
