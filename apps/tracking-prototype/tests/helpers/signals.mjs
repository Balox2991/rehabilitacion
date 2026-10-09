// Generador de señales sintéticas de ángulo para probar el contador de repeticiones.
// Imita lo que entrega la cámara: movimiento suave reposo→extremo→reposo, con una pausa arriba (el «sostén» de los ejercicios),
// ruido gaussiano, picos aislados (la detección se «equivoca» un frame) y tiempos irregulares entre frames.

export function rng(seed) { // mulberry32: determinista, para que las pruebas no sean aleatorias
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * @param {object} o
 * @param {number} o.reps repeticiones reales
 * @param {number} o.restAngle ángulo en reposo   @param {number} o.peakAngle ángulo en el extremo (lo que de verdad alcanza)
 * @param {number} [o.moveMs=900] ida (y vuelta, cada una)   @param {number} [o.holdMs=500] sostén arriba   @param {number} [o.pauseMs=600] pausa en reposo
 * @param {number} [o.noiseSd=0] ruido en grados   @param {number} [o.spikeProb=0] prob. de un pico aislado   @param {number} [o.spikeDeg=40]
 * @param {number} [o.fps=30]   @param {number} [o.jitterMs=0] variación aleatoria del intervalo entre frames   @param {number} [o.dropProb=0] frames perdidos
 * @param {number} [o.leadMs=1500] reposo inicial   @param {number} [o.seed=1]
 * @param {number} [o.fatigue=0] fracción del recorrido que se pierde hacia la última repetición (0,3 = llega 30 % menos lejos al final)
 */
export function generateReps(o) {
  const { reps, restAngle, peakAngle, fatigue = 0, moveMs = 900, holdMs = 500, pauseMs = 600, noiseSd = 0, spikeProb = 0, spikeDeg = 40, fps = 30, jitterMs = 0, dropProb = 0, leadMs = 1500, seed = 1 } = o;
  const r = rng(seed);
  const cycle = moveMs + holdMs + moveMs + pauseMs;
  const total = leadMs + reps * cycle + 1500;
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x); // 0→1 suave
  const truth = (t) => {
    const u = t - leadMs;
    if (u < 0 || u >= reps * cycle) return 0;
    const c = u % cycle;
    const k = Math.floor(u / cycle);
    const amp = 1 - fatigue * (reps > 1 ? k / (reps - 1) : 0); // cada repetición llega un poco menos lejos
    if (c < moveMs) return amp * ease(c / moveMs);
    if (c < moveMs + holdMs) return amp;
    if (c < moveMs + holdMs + moveMs) return amp * (1 - ease((c - moveMs - holdMs) / moveMs));
    return 0;
  };
  const samples = [];
  const step = 1000 / fps;
  for (let t = 0; t < total; t += step + (jitterMs ? (r() - 0.5) * 2 * jitterMs : 0)) {
    if (dropProb && r() < dropProb) continue;
    let angle = restAngle + (peakAngle - restAngle) * truth(t) + (noiseSd ? gauss(r) * noiseSd : 0);
    if (spikeProb && r() < spikeProb) angle += (r() < 0.5 ? -1 : 1) * spikeDeg;
    samples.push([Math.max(0, Math.min(180, angle)), Math.round(t)]);
  }
  return samples;
}

export function run(counter, samples) {
  const completed = [];
  for (const [angle, t] of samples) {
    const out = counter.update(angle, t);
    if (out.repCompleted) completed.push({ t, rom: counter.lastRomAchieved });
  }
  return completed;
}
