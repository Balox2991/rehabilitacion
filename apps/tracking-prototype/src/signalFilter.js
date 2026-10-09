/**
 * signalFilter.js
 * ------------------------------------------------------------------
 * Filtros para limpiar la señal de ángulo antes de contar repeticiones. Sin dependencias ni DOM.
 *
 * Por qué hace falta: el detector de pose entrega una estimación por frame y cada una trae ruido (unos pocos grados) y,
 * de vez en cuando, un frame «equivocado» (la rodilla salta 40° y vuelve). Contar sobre la señal cruda hace que el ROM
 * medido sea siempre el extremo del ruido (sesgo hacia más movimiento) y permite repeticiones falsas.
 *
 * Dos pasos, en este orden:
 *   1. Mediana de 5: elimina picos de hasta 2 frames seguidos (un solo frame «equivocado» ya era raro; dos seguidos ocurren
 *      cuando el modelo pierde y recupera la articulación) con solo 2 frames de retraso. No recorta movimientos reales:
 *      una mediana respeta las subidas y bajadas sostenidas; solo borra lo más angosto que la mitad de su ventana.
 *   2. Filtro «One Euro» (Casiez, Roussel y Vogel, CHI 2012): suaviza mucho cuando la articulación está casi quieta
 *      (quita el temblor) y poco cuando se mueve rápido (no atrasa el movimiento). Es el filtro estándar para
 *      seguimiento de movimiento en tiempo real.
 */

export class MedianFilter {
  constructor(size = 5) { this.size = size; this.buf = []; }
  push(x) {
    this.buf.push(x);
    if (this.buf.length > this.size) this.buf.shift();
    if (this.buf.length < this.size) return x; // al arrancar, sin ventana completa, no se altera la lectura
    return [...this.buf].sort((a, b) => a - b)[this.size >> 1];
  }
  /** ¿Ya hay una ventana completa? Antes de eso la salida es la lectura cruda y no es confiable. */
  get ready() { return this.buf.length >= this.size; }
  reset() { this.buf = []; }
}

const smoothingFactor = (cutoffHz, dtSec) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
};

export class OneEuroFilter {
  /**
   * @param {number} [minCutoff=1.2] Hz. Menor = más suave en reposo (y más retraso).
   * @param {number} [beta=0.05] cuánto se abre el filtro con la velocidad (grados/s). Mayor = sigue mejor movimientos rápidos.
   * @param {number} [dCutoff=1] Hz del filtro de la velocidad.
   * @param {number} [resetGapMs=1000] si pasa más de esto entre muestras (cámara pausada), se vuelve a empezar.
   */
  constructor({ minCutoff = 1.2, beta = 0.05, dCutoff = 1, resetGapMs = 1000 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff, resetGapMs });
    this.reset();
  }

  reset() { this.x = null; this.dx = 0; this.t = null; }

  filter(value, tMs) {
    if (this.x === null || tMs - this.t > this.resetGapMs) {
      this.x = value; this.dx = 0; this.t = tMs;
      return value;
    }
    const dt = (tMs - this.t) / 1000;
    if (dt <= 0) return this.x; // marca de tiempo repetida o atrasada: se ignora
    const rawDx = (value - this.x) / dt;
    this.dx += smoothingFactor(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += smoothingFactor(cutoff, dt) * (value - this.x);
    this.t = tMs;
    return this.x;
  }
}

/**
 * Mediana CENTRADA (usa lecturas de antes Y de después): para análisis posterior de una grabación completa, donde sí
 * se conoce el futuro. Quita picos de hasta `(size-1)/2` lecturas sin retrasar nada. Los bordes usan la ventana disponible.
 */
export function medianCentered(values, size = 5) {
  const half = size >> 1;
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1)).sort((a, b) => a - b);
    return w[w.length >> 1];
  });
}

/**
 * Suavizado SIN RETRASO para análisis posterior: se pasa el filtro One Euro hacia adelante y hacia atrás y se promedian
 * ambas pasadas (el retraso de una es el adelanto de la otra y se cancelan). En vivo no se puede (falta el futuro);
 * con la sesión grabada sí, y por eso el análisis posterior mide los extremos con más exactitud.
 * @param {number[]} timesMs crecientes   @param {number[]} values
 */
export function zeroPhaseOneEuro(timesMs, values, options = {}) {
  const run = (ts, vs) => {
    const f = new OneEuroFilter(options);
    return vs.map((v, i) => f.filter(v, ts[i]));
  };
  const forward = run(timesMs, values);
  const rts = timesMs.map((t) => -t).reverse();
  const backward = run(rts, [...values].reverse()).reverse();
  return forward.map((v, i) => (v + backward[i]) / 2);
}
