import test from "node:test";
import assert from "node:assert/strict";
import { MedianFilter, OneEuroFilter } from "../src/signalFilter.js";
import { rng } from "./helpers/signals.mjs";

const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

test("MedianFilter(5) elimina picos de 1 y de 2 frames seguidos", () => {
  const one = new MedianFilter(5);
  assert.deepEqual([100, 100, 100, 100, 40, 100, 100, 100].map((x) => one.push(x)).slice(4), [100, 100, 100, 100]);
  const two = new MedianFilter(5);
  assert.deepEqual([100, 100, 100, 100, 40, 40, 100, 100, 100].map((x) => two.push(x)).slice(4), [100, 100, 100, 100, 100]);
});

test("MedianFilter deja pasar un cambio sostenido (3 o más frames) con 2 frames de retraso", () => {
  const m = new MedianFilter(5);
  const out = [100, 100, 100, 100, 100, 40, 40, 40, 40, 40].map((x) => m.push(x));
  assert.deepEqual(out.slice(5), [100, 100, 40, 40, 40]);
});

test("MedianFilter no altera las primeras lecturas y avisa cuándo la ventana está completa", () => {
  const m = new MedianFilter(5);
  assert.deepEqual([10, 50, 20].map((x) => m.push(x)), [10, 50, 20]);
  assert.equal(m.ready, false);
  m.push(30); m.push(25);
  assert.equal(m.ready, true);
  m.reset();
  assert.equal(m.ready, false);
});

test("OneEuro: sobre una señal quieta con ruido de ±3° reduce la dispersión a menos de la mitad", () => {
  const r = rng(1), f = new OneEuroFilter();
  const raw = [], out = [];
  for (let t = 0; t < 10000; t += 33) {
    const x = 120 + (r() - 0.5) * 2 * 5; // ruido uniforme ±5 (sd ≈ 2,9)
    raw.push(x); out.push(f.filter(x, t));
  }
  assert.ok(sd(out.slice(30)) < sd(raw.slice(30)) / 2);
});

test("OneEuro: sigue una rampa rápida (90°/s) con un retraso pequeño", () => {
  const f = new OneEuroFilter();
  let last = 0, t = 0;
  for (; t < 1000; t += 33) last = f.filter(100 + 90 * (t / 1000), t);
  const ideal = 100 + 90 * ((t - 33) / 1000);
  assert.ok(ideal - last < 20, `retraso ${ideal - last}°`);
});

test("OneEuro: converge al valor real cuando la señal queda quieta", () => {
  const f = new OneEuroFilter();
  let v = 0;
  for (let t = 0; t < 3000; t += 33) v = f.filter(t < 500 ? 50 : 120, t);
  assert.ok(Math.abs(v - 120) < 0.5);
});

test("OneEuro: marcas de tiempo repetidas o atrasadas no producen NaN ni saltos", () => {
  const f = new OneEuroFilter();
  f.filter(100, 1000);
  const a = f.filter(110, 1000), b = f.filter(110, 900);
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
  assert.equal(a, 100);
});

test("OneEuro: tras un hueco largo (cámara pausada) arranca de nuevo sin arrastrar el valor anterior", () => {
  const f = new OneEuroFilter();
  f.filter(100, 0);
  assert.equal(f.filter(40, 120000), 40);
});
