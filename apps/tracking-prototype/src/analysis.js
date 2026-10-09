/**
 * analysis.js
 * ------------------------------------------------------------------
 * Análisis POSTERIOR de una sesión grabada (serie de ángulos + banderas de postura). Puro: sin cámara, sin DOM, sin red.
 * Lo ejecutan el navegador (para mostrarle su resultado al paciente al instante) y el servidor (para guardar el análisis
 * a partir del registro y poder rehacerlo si el análisis mejora).
 *
 * POR QUÉ UN ANÁLISIS APARTE DEL CONTADOR EN VIVO (docs/ARQUITECTURA.md, sección 12):
 * en vivo solo se conoce el pasado: los filtros atrasan y cada repetición se decide sin ver lo que viene. Con la sesión
 * completa se puede suavizar sin retraso (pasada hacia adelante y hacia atrás), buscar los picos mirando toda la ventana
 * (prominencia) y medir con exactitud cuánto duró cada subida, sostén y bajada. El conteo en vivo sigue siendo la guía
 * del paciente; el dato que queda guardado sale de aquí.
 *
 * Todos los umbrales de las sugerencias son ORIENTATIVOS y configurables; no son criterio clínico.
 */

import { MIN_VISIBILITY } from "./angleMath.js";
import { repThresholds } from "./repCounter.js";
import { medianCentered, zeroPhaseOneEuro } from "./signalFilter.js";

export const ANALYZER_VERSION = 1;
export const TRACE_FORMAT = "telerehab-trace/2";

const GAP_MS = 1000; // más que esto entre dos lecturas válidas = la articulación se perdió de vista
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  const m = mean(xs);
  return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) : 0;
};

/**
 * Picos con su prominencia (cuánto sobresalen de los valles que los rodean). Un pico bajo cuyo valle es superficial no cuenta.
 * `rightEdgeDrop(excursión)`: si el registro TERMINA mientras la persona ya está bajando de un pico grande (apretó «terminar»
 * a mitad de la bajada), no hay valle a la derecha; con esta función el pico cuenta si ya bajó lo suficiente. Es el mismo
 * criterio del conteo en vivo, para que lo que el paciente vio contar coincida con lo que se guarda.
 */
export function findPeaks(s, minProminence, { rightEdgeDrop = null, times = null, minHumpMs = 250 } = {}) {
  const peaks = [];
  for (let i = 1; i < s.length - 1; i++) {
    if (!(s[i] > s[i - 1] && s[i] >= s[i + 1])) continue;
    let l = i - 1, lMin = s[i], lMinAt = i;
    for (; l >= 0 && s[l] <= s[i]; l--) if (s[l] < lMin) { lMin = s[l]; lMinAt = l; }
    let r = i + 1, rMin = s[i], rMinAt = i;
    for (; r < s.length && s[r] <= s[i]; r++) if (s[r] < rMin) { rMin = s[r]; rMinAt = r; }
    let prominence = s[i] - Math.max(lMin, rMin);
    if (prominence < minProminence && r === s.length && rightEdgeDrop && s[i] - lMin >= minProminence && s[i] - rMin >= rightEdgeDrop(s[i] - lMin)) {
      // La bajada quedó cortada por el final del registro, pero ya había empezado de verdad. Como no hay un valle que lo
      // confirme, se exige además que el «lomo» sea de un movimiento humano: que se mantenga por encima de la mitad del
      // recorrido al menos `minHumpMs` (un grupo de lecturas malas seguidas dura una fracción de eso).
      const half = lMin + 0.5 * (s[i] - lMin);
      let a = i, z = i;
      while (a > 0 && s[a - 1] >= half) a--;
      while (z < s.length - 1 && s[z + 1] >= half) z++;
      if (!times || times[z] - times[a] >= minHumpMs) prominence = s[i] - lMin;
    }
    if (prominence >= minProminence) peaks.push({ index: i, prominence, leftBase: lMinAt, rightBase: rMinAt });
  }
  return peaks;
}

/**
 * Nivel del extremo de una repetición. Si el paciente SOSTIENE arriba (meseta de ≥ 300 ms dentro del 5 % del recorrido),
 * la mediana de esa meseta es mucho más exacta que el máximo, que con ruido siempre se queda con el pico del ruido
 * (error medio 0,8° frente a 1,65° en las simulaciones). Sin meseta (movimiento sin pausa) el máximo suavizado es lo mejor
 * que hay: cualquier promedio incluiría los hombros del pico y lo subestimaría.
 */
export function extremeLevel(s, times, pk, plateauMs = 300, bandFraction = 0.05) {
  const lim = s[pk.index] - bandFraction * pk.prominence;
  let l = pk.index, r = pk.index;
  while (l > 0 && s[l - 1] >= lim) l--;
  while (r < s.length - 1 && s[r + 1] >= lim) r++;
  if (times[r] - times[l] < plateauMs) return s[pk.index];
  const band = s.slice(l, r + 1).sort((a, b) => a - b);
  return band[band.length >> 1];
}

// Instante (ms) en que la serie cruza `level` entre i y i+1, por interpolación lineal.
function crossingTime(times, s, i, level) {
  const a = s[i], b = s[i + 1];
  if (a === b) return times[i];
  const k = Math.min(1, Math.max(0, (level - a) / (b - a)));
  return times[i] + k * (times[i + 1] - times[i]);
}

/** Banderas de postura activas en algún momento de [t0, t1]. `events` = [[t_ms, [nombres]]] (cada una vale hasta la siguiente). */
export function flagsDuring(events, t0, t1) {
  const out = new Set();
  const list = events ?? [];
  for (let k = 0; k < list.length; k++) {
    const from = list[k][0];
    const to = k + 1 < list.length ? list[k + 1][0] : Infinity;
    if (from <= t1 && to >= t0) list[k][1].forEach((f) => out.add(f));
  }
  return [...out];
}

/**
 * @param {object} trace registro de la sesión (formato telerehab-trace/2: t, angle, vis, flags, meta)
 * @param {object} [options]
 * @param {number} [options.expectedReps]   series × repeticiones prescritas (para avisar si hizo muy pocas)
 * @param {number} [options.holdSeconds]    sostén prescrito arriba, si el ejercicio lo pide
 * @param {number} [options.targetToleranceDeg=8]
 */
export function analyzeSession(trace, options = {}) {
  const { expectedReps = null, holdSeconds = null, targetToleranceDeg = 8 } = options;
  const { meta, t: tAll = [], angle: aAll = [], vis: vAll = [] } = trace;
  const toFlex = (a) => (meta.direction === "decreasing" ? 180 - a : a);
  const fromFlex = (f) => (meta.direction === "decreasing" ? 180 - f : f);

  // 1) Solo lecturas confiables: la articulación se veía bien.
  const times = [], flex = [];
  for (let i = 0; i < tAll.length; i++) {
    if (Number.isFinite(aAll[i]) && (vAll[i] ?? 1) >= MIN_VISIBILITY) { times.push(tAll[i]); flex.push(toFlex(aAll[i])); }
  }
  const t0 = tAll.length ? tAll[0] : 0;
  const durationS = tAll.length ? round1((tAll[tAll.length - 1] - t0) / 1000) : 0;
  const visiblePct = tAll.length ? Math.round((times.length / tAll.length) * 100) : 0;
  const base = { analyzer_version: ANALYZER_VERSION, duration_s: durationS, samples: tAll.length, visible_pct: visiblePct };

  if (times.length < 15) {
    const none = summarize([], expectedReps, 0);
    return { ...base, reps: [], summary: none, suggestions: rules([], none, { visiblePct, expectedReps, holdSeconds, target: toFlex(meta.targetAngle) }) };
  }

  // 2) Suavizado sin retraso (mediana centrada + One Euro adelante y atrás).
  const s = zeroPhaseOneEuro(times, medianCentered(flex, 5), { minCutoff: 2, beta: 0.05 });

  // 3) Picos con prominencia suficiente = repeticiones.
  const { minExcursionDeg, startDeg } = repThresholds({ targetAngle: meta.targetAngle, restAngle: meta.restAngle, direction: meta.direction });
  const targetFlex = toFlex(meta.targetAngle);
  const reps = [];
  let interrupted = 0;
  for (const pk of findPeaks(s, minExcursionDeg, { rightEdgeDrop: (exc) => Math.max(startDeg * 0.6, 0.2 * exc), times })) {
    const p = pk.index;
    // Una repetición que cruza un hueco de visibilidad no es confiable: se descarta y se cuenta aparte.
    let gap = false;
    for (let i = pk.leftBase; i < pk.rightBase; i++) if (times[i + 1] - times[i] > GAP_MS) { gap = true; break; }
    if (gap) { interrupted++; continue; }

    const peak = s[p], lv = s[pk.leftBase], rv = s[pk.rightBase];
    const level = extremeLevel(s, times, pk); // lo que se REPORTA como ROM; `peak` solo sirve para ubicar los tiempos
    const aL = peak - lv, aR = peak - rv;
    // Subida: del 10 % al 90 % del recorrido. Sostén: arriba del 90 %. Bajada: del 90 % al 10 %.
    let i = p;
    while (i > pk.leftBase && s[i - 1] > lv + 0.1 * aL) i--;
    const riseStart = i > 0 ? crossingTime(times, s, i - 1, lv + 0.1 * aL) : times[0];
    const top = peak - 0.1 * Math.min(aL, aR);
    let tl = p, tr = p;
    while (tl > pk.leftBase && s[tl - 1] >= top) tl--;
    while (tr < pk.rightBase && s[tr + 1] >= top) tr++;
    let j = tr;
    while (j < pk.rightBase && s[j + 1] > rv + 0.1 * aR) j++;
    const descentEnd = j + 1 < s.length ? crossingTime(times, s, j, rv + 0.1 * aR) : times[times.length - 1];
    const tTopFrom = times[tl], tTopTo = times[tr];

    reps.push({
      n: reps.length + 1,
      t_start_s: round2((riseStart - t0) / 1000),
      t_peak_s: round2(((tTopFrom + tTopTo) / 2 - t0) / 1000),
      t_end_s: round2((descentEnd - t0) / 1000),
      angle: round1(fromFlex(level)),
      flexion: round1(level),
      reached_target: level >= targetFlex - targetToleranceDeg,
      up_s: round2(Math.max(0, tTopFrom - riseStart) / 1000),
      hold_s: round2((tTopTo - tTopFrom) / 1000),
      down_s: round2(Math.max(0, descentEnd - tTopTo) / 1000),
      flags: flagsDuring(trace.flags, riseStart, descentEnd),
    });
  }

  const summary = summarize(reps, expectedReps, interrupted);
  return { ...base, reps, summary, suggestions: rules(reps, summary, { visiblePct, expectedReps, holdSeconds, target: targetFlex }) };
}

function summarize(reps, expectedReps, interrupted) {
  const roms = reps.map((r) => r.flexion);
  const third = Math.floor(reps.length / 3);
  const first = third >= 2 ? mean(roms.slice(0, third)) : null;
  const last = third >= 2 ? mean(roms.slice(-third)) : null;
  const cycles = reps.slice(1).map((r, i) => r.t_peak_s - reps[i].t_peak_s);
  const cycleMean = mean(cycles);
  const flagged = reps.filter((r) => r.flags.length).length;
  const m = (key) => (reps.length ? round2(mean(reps.map((r) => r[key]))) : null);
  return {
    count: reps.length,
    expected: expectedReps,
    interrupted,
    reached_target: reps.filter((r) => r.reached_target).length,
    rom: {
      best: roms.length ? Math.max(...roms) : null,
      mean: roms.length ? round1(mean(roms)) : null,
      worst: roms.length ? Math.min(...roms) : null,
      first_third: first == null ? null : round1(first),
      last_third: last == null ? null : round1(last),
      drop_pct: first && last != null ? round1(((first - last) / first) * 100) : null,
    },
    tempo: {
      up_s: m("up_s"),
      hold_s: m("hold_s"),
      down_s: m("down_s"),
      cycle_s: cycleMean == null ? null : round2(cycleMean),
      cycle_cv_pct: cycles.length >= 3 && cycleMean ? round1((sd(cycles) / cycleMean) * 100) : null,
    },
    flagged_reps: flagged,
    flagged_pct: reps.length ? Math.round((flagged / reps.length) * 100) : 0,
  };
}

// Umbrales ORIENTATIVOS (no clínicos). Se agrupan aquí para que se vean y se puedan discutir.
export const THRESHOLDS = {
  minVisiblePct: 80, // por debajo, la medición pierde confiabilidad
  fatigueDropPct: 15, // caída del ROM entre el primer y el último tercio de la sesión
  fastPhaseS: 0.6, // subida o bajada (10–90 %) más rápida que esto = movimiento poco controlado
  holdFraction: 0.5, // sostén menor a la mitad de lo prescrito
  irregularCyclePct: 35, // variación (CV) del ritmo entre repeticiones
  flaggedPct: 30, // % de repeticiones con alerta de postura
  incompleteFraction: 0.5, // menos de la mitad de las repeticiones prescritas
};

/** Observaciones de la sesión. Cada una es `{ code, severity: 'warn'|'info', data }`; el TEXTO lo arma la pantalla según quién lo lea. */
export function rules(reps, summary, ctx) {
  const out = [];
  const add = (code, severity, data = {}) => out.push({ code, severity, data });
  const { visiblePct, expectedReps, holdSeconds, target } = ctx; // `target` = meta en GRADOS DE FLEXIÓN, igual que rom.best
  const T = THRESHOLDS;

  if (visiblePct < T.minVisiblePct) add("low_visibility", "warn", { pct: visiblePct });
  if (summary.count === 0) { add("no_reps", "warn"); return out; }
  if (summary.interrupted > 0) add("interrupted", "info", { count: summary.interrupted });
  if (expectedReps && summary.count < expectedReps * T.incompleteFraction) add("incomplete", "info", { done: summary.count, expected: expectedReps });
  if (summary.reached_target === 0) add("target_not_reached", "info", { best: summary.rom.best, target });
  if (summary.rom.drop_pct != null && summary.rom.drop_pct >= T.fatigueDropPct) add("fatigue", "warn", { drop_pct: summary.rom.drop_pct, first: summary.rom.first_third, last: summary.rom.last_third });
  if (summary.tempo.up_s != null && summary.tempo.up_s < T.fastPhaseS) add("fast_up", "warn", { seconds: summary.tempo.up_s });
  if (summary.tempo.down_s != null && summary.tempo.down_s < T.fastPhaseS) add("fast_down", "warn", { seconds: summary.tempo.down_s });
  if (holdSeconds && summary.tempo.hold_s != null && summary.tempo.hold_s < holdSeconds * T.holdFraction) add("short_hold", "info", { seconds: summary.tempo.hold_s, expected: holdSeconds });
  if (summary.tempo.cycle_cv_pct != null && summary.tempo.cycle_cv_pct > T.irregularCyclePct) add("irregular_rhythm", "info", { cv_pct: summary.tempo.cycle_cv_pct });
  if (summary.flagged_pct >= T.flaggedPct) add("posture", "warn", { pct: summary.flagged_pct });
  if (!out.some((o) => o.severity === "warn")) add("well_done", "info", {});
  return out;
}
