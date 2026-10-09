/**
 * repCounter.js
 * ------------------------------------------------------------------
 * Cuenta repeticiones a partir de la serie de ángulos de UNA articulación en el tiempo. Independiente de MediaPipe:
 * solo recibe números (ángulo, timestamp), así se prueba con señales sintéticas (tests/repCounter.test.mjs).
 *
 * VERSIÓN 2 — qué cambió y por qué (ver docs/FASE-1-TRACKING.md, «Correcciones posteriores»):
 *
 * La versión 1 contaba una repetición solo si el ángulo llegaba a la META del plan (± tolerancia) y volvía a un REPOSO
 * fijo. Con una persona real fallaba de dos maneras:
 *   - Un paciente en recuperación casi nunca llega a la meta (de eso se trata la rehabilitación: va por el 40 %, el 70 %…).
 *     Resultado: movía la pierna 10 veces y la aplicación contaba 0.
 *   - El reposo real nunca es exactamente 175°, y un solo frame con ruido bastaba para «entrar» a la zona objetivo.
 *
 * Esta versión detecta repeticiones por la FORMA del movimiento, no por umbrales absolutos:
 *   1. Limpia la señal (mediana de 5 + filtro One Euro, ver signalFilter.js).
 *   2. Trabaja en «grados de flexión» (0 = reposo, sube al moverse), igual en rodilla, codo y hombro.
 *   3. Sigue los valles y los picos (zig-zag): una repetición es un pico que se levanta al menos `minExcursionDeg` por
 *      encima del valle anterior y que luego baja `dropDeg` (la histéresis que evita contar el ruido del extremo).
 *   4. El ROM de la repetición es el pico REAL alcanzado, llegue o no a la meta. La meta solo decide si
 *      `lastReachedTarget` es verdadero (el fisioterapeuta ve «llegó» / «no llegó», no un conteo en cero).
 *
 * Como no depende de un reposo calibrado, tampoco se rompe si el paciente no extiende del todo entre repeticiones.
 */

import { MedianFilter, OneEuroFilter } from "./signalFilter.js";

export const RepState = {
  RESTING: "resting", // buscando que empiece un movimiento (sigue el valle)
  MOVING: "moving", // subiendo hacia el extremo (sigue el pico)
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Umbrales por defecto según el recorrido hasta la meta (en grados de flexión). Los comparten el contador en vivo y el
 * análisis posterior, para que ambos llamen «repetición» a lo mismo.
 *  - minExcursionDeg: movimiento mínimo para contar una repetición (30 % del recorrido, entre 12° y 30°)
 *  - startDeg: cuánto debe subir desde el valle para considerar que empezó a moverse (15 %, entre 8° y 20°)
 */
export function repThresholds({ targetAngle, restAngle, direction }) {
  const flex = (a) => (direction === "decreasing" ? 180 - a : a);
  const range = Math.max(1, flex(targetAngle) - flex(restAngle));
  return { minExcursionDeg: clamp(0.3 * range, 12, 30), startDeg: clamp(0.15 * range, 8, 20) };
}

export class RepCounter {
  /**
   * @param {Object} config
   * @param {number} config.targetAngle - ángulo interno objetivo (ROM a alcanzar), según el plan
   * @param {number} config.restAngle - ángulo interno de reposo aproximado (solo calibra los umbrales por defecto)
   * @param {"increasing"|"decreasing"} config.direction - si el ángulo sube o baja al moverse hacia el objetivo
   * @param {number} [config.minExcursionDeg] - movimiento mínimo (grados) para contar una repetición. Por defecto 30 % del
   *   recorrido hasta la meta, entre 12° y 30°. Más bajo = cuenta movimientos más pequeños (y más ruido).
   * @param {number} [config.startDeg] - cuánto debe subir desde el valle para considerar que empezó a moverse (8°–20°).
   * @param {number} [config.minRiseMs=300] - tiempo mínimo que dura la subida hasta el pico: un movimiento humano no es instantáneo.
   * @param {number} [config.targetToleranceDeg=8] - margen para decir que «llegó a la meta».
   * @param {Object} [config.filter] - opciones de OneEuroFilter ({ minCutoff, beta, dCutoff }).
   */
  constructor({ targetAngle, restAngle, direction, minExcursionDeg, startDeg, minRiseMs = 300, targetToleranceDeg = 8, filter } = {}) {
    this.targetAngle = targetAngle;
    this.restAngle = restAngle;
    this.direction = direction;
    this.targetToleranceDeg = targetToleranceDeg;
    this.minRiseMs = minRiseMs;

    const defaults = repThresholds({ targetAngle, restAngle, direction });
    this.minExcursionDeg = minExcursionDeg ?? defaults.minExcursionDeg;
    this.startDeg = startDeg ?? defaults.startDeg;

    this._median = new MedianFilter(5);
    this._euro = new OneEuroFilter(filter);
    this.reset();
  }

  // Grados de flexión: 0 en reposo, crece al moverse. (Misma convención que lib/rom.js y el backend.)
  _toFlex(angle) { return this.direction === "decreasing" ? 180 - angle : angle; }
  _toAngle(flex) { return this.direction === "decreasing" ? 180 - flex : flex; }

  /**
   * Alimenta una nueva lectura de ángulo (llamar con cada detección válida).
   * @returns {{repCompleted:boolean, state:string, reps:number, angle:number|null, flexion:number|null, inTarget:boolean}}
   */
  update(angle, timestampMs) {
    if (!Number.isFinite(angle)) return this._snapshot(false);

    const cleaned = this._median.push(angle);
    if (!this._median.ready) return this._snapshot(false); // calentamiento: con menos de 5 lecturas un pico inicial fijaría un valle falso
    const smooth = this._euro.filter(cleaned, timestampMs);
    const f = this._toFlex(smooth);
    this.filteredAngle = smooth;
    this.flexion = f;
    let repCompleted = false;

    if (this.valley === null) {
      this.valley = f;
      this.riseStartAt = timestampMs;
    }
    const dtSec = this._lastT == null ? 0 : (timestampMs - this._lastT) / 1000;
    const speed = dtSec > 0 ? Math.abs(f - this._lastF) / dtSec : 0; // grados de flexión por segundo
    this._lastT = timestampMs;
    this._lastF = f;

    if (this.state === RepState.RESTING) {
      if (f < this.valley) {
        this.valley = f;
      } else if (speed < 10 && dtSec > 0) {
        // Quieto: el valle se va acercando poco a poco a donde de verdad descansa la articulación (τ = 8 s),
        // para que un hundimiento pasajero no deje un «valle» tan bajo que el descanso normal parezca una subida.
        this.valley += (f - this.valley) * Math.min(1, dtSec / 8);
      }
      if (f - this.valley <= this.startDeg * 0.5) this.riseStartAt = timestampMs; // última vez que estuvo en el fondo
      if (f - this.valley >= this.startDeg) {
        this.state = RepState.MOVING;
        this.peak = f;
        this.peakAt = timestampMs;
      }
    } else {
      if (f > this.peak) {
        this.peak = f;
        this.peakAt = timestampMs;
      }
      const excursion = this.peak - this.valley;
      const dropDeg = Math.max(this.startDeg * 0.6, 0.2 * excursion);
      if (this.peak - f >= dropDeg) {
        // El pico quedó atrás: es una repetición si fue lo bastante grande y no instantánea.
        if (excursion >= this.minExcursionDeg && this.peakAt - this.riseStartAt >= this.minRiseMs) {
          this.reps += 1;
          this.lastRomAchieved = Math.round(this._toAngle(this.peak) * 10) / 10;
          this.lastReachedTarget = this.peak >= this._toFlex(this.targetAngle) - this.targetToleranceDeg;
          repCompleted = true;
        } else {
          this.discarded += 1; // movimiento demasiado pequeño o brusco: ruido, no repetición
        }
        this.state = RepState.RESTING;
        this.valley = f;
        this.riseStartAt = timestampMs;
      }
    }
    return this._snapshot(repCompleted);
  }

  _snapshot(repCompleted) {
    return { repCompleted, state: this.state, reps: this.reps, angle: this.filteredAngle, flexion: this.flexion, inTarget: this.inTarget };
  }

  /** ¿Está ahora mismo en el rango de la meta? (solo para mostrar «en rango objetivo»). */
  get inTarget() {
    return this.flexion != null && this.flexion >= this._toFlex(this.targetAngle) - this.targetToleranceDeg;
  }

  reset() {
    this._median.reset();
    this._euro.reset();
    this.state = RepState.RESTING;
    this.reps = 0;
    this.discarded = 0;
    this.valley = null;
    this.riseStartAt = 0;
    this._lastT = null;
    this._lastF = null;
    this.peak = null;
    this.peakAt = 0;
    this.filteredAngle = null;
    this.flexion = null;
    this.lastRomAchieved = null; // ángulo interno del pico de la última repetición contada
    this.lastReachedTarget = null;
  }
}
