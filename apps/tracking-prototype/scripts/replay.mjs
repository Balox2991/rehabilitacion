// Uso: node scripts/replay.mjs sesion-knee_flexion-2026-10-05-16-20-11.json [minExcursionDeg] [startDeg]
// (los dos parámetros opcionales afectan al conteo en vivo, para probar otros umbrales)
import { readFileSync } from "node:fs";
import { replayTrace } from "../src/replay.js";

const [file, minExcursionDeg, startDeg] = process.argv.slice(2);
if (!file) {
  console.error("Uso: node scripts/replay.mjs <registro.json> [minExcursionDeg] [startDeg]");
  process.exit(1);
}
const trace = JSON.parse(readFileSync(file, "utf8"));
const overrides = {};
if (minExcursionDeg) overrides.minExcursionDeg = Number(minExcursionDeg);
if (startDeg) overrides.startDeg = Number(startDeg);
const r = replayTrace(trace, overrides);
const sign = (n) => (n > 0 ? `+${n}` : String(n));

console.log(`Ejercicio: ${trace.meta.exercise} (${trace.meta.side}) · meta ${trace.meta.targetAngle}° · modelo ${trace.meta.model ?? "?"}`);
console.log(`Duración: ${r.seconds} s · lecturas usadas: ${r.samplesUsed} · descartadas por visibilidad baja: ${r.samplesHidden}`);
console.log("");
console.log(`Conteo EN VIVO (lo que vio el paciente):  ${r.live.detected}   (movimientos pequeños descartados: ${r.live.discarded})`);
console.log(`Análisis POSTERIOR (lo que se guarda):    ${r.offline.detected}`);
if (r.manualCount != null) {
  console.log(`Repeticiones reales (contadas a mano):    ${r.manualCount}   → en vivo ${sign(r.differenceLive)} · posterior ${sign(r.differenceOffline)}`);
}
console.log("");
r.offline.reps.forEach((x) =>
  console.log(`  #${String(x.n).padStart(2)}  ${x.t_peak_s.toFixed(1).padStart(5)} s  ángulo ${String(x.angle).padStart(5)}°  flexión ${String(x.flexion).padStart(5)}°  subida ${x.up_s}s sostén ${x.hold_s}s bajada ${x.down_s}s  ${x.reached_target ? "llegó" : "no llegó"} ${x.flags.length ? "· " + x.flags.join(", ") : ""}`)
);
console.log("");
r.offline.suggestions.forEach((s) => console.log(`  [${s.severity}] ${s.code} ${JSON.stringify(s.data)}`));
