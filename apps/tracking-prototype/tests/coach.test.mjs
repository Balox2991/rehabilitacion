import test from "node:test";
import assert from "node:assert/strict";
import { COACH, COACH_CODES, coach, theilSen, trendOf } from "../src/coach.js";

const KNEE = { direction: "decreasing", rest: 175 }; // meta 90° de flexión = ángulo 90
const SHOULDER = { direction: "increasing", rest: 15 };
const plan = (over = {}) => ({ plan_id: 7, target_angle: 90, sets: 3, reps_per_set: 10, times_per_week: 4, ...over });
const hist = (flexions, over = {}) => flexions.map((flexion) => ({ flexion, reps: 10, flagged_pct: 0, drop_pct: 0, fast: false, low_visibility: false, ...over }));
const run = (flexions, o = {}) => coach({ exercise: KNEE, plan: plan(), phase: "movilidad", history: hist(flexions), current: null, recentSessions: 8, planAgeDays: 30, ...o });
const codes = (r) => ({ h: r.patient.highlights.map((x) => x.code), f: r.patient.focus.map((x) => x.code), c: r.patient.care.map((x) => x.code), t: r.therapist.map((x) => x.code) });
const analysisWith = (...suggestionCodes) => ({ suggestions: suggestionCodes.map((code) => ({ code, severity: "warn", data: { seconds: 0.4, drop_pct: 22, pct: 40, cv_pct: 50, expected: 3 } })) });

// ------------------------------------------------------------------ tendencia

test("theilSen: pendiente robusta; un día excepcional no la tuerce", () => {
  assert.equal(theilSen([10, 20, 30, 40]), 10);
  assert.equal(theilSen([10, 20, 30, 40, 100]), 10); // el 100 es un atípico
  assert.equal(theilSen([5]), 0);
  assert.equal(theilSen([]), 0);
});

test("trendOf: mejora sostenida, estancamiento y retroceso se distinguen entre sí", () => {
  const up = trendOf([40, 46, 52, 58, 64], 90);
  assert.equal(up.improving, true);
  assert.ok(up.gain >= 12 && up.slope > 5);
  assert.equal(up.plateau, false);
  const flat = trendOf([60, 61, 59, 62, 60], 90);
  assert.equal(flat.plateau, true);
  assert.equal(flat.improving, false);
  const down = trendOf([60, 61, 62, 50], 90);
  assert.equal(down.regression, true);
});

test("MARGEN DE ERROR: cambios menores a 4° (lo que mide mal la cámara) no son mejora ni retroceso", () => {
  const noisy = trendOf([60, 63, 61, 63.5], 90);
  assert.equal(noisy.improving, false);
  assert.equal(noisy.regression, false);
  assert.equal(trendOf([60, 61, 62, 57.5], 90).regression, false); // −4,5° frente a 61: por debajo del umbral de 8°
  assert.equal(trendOf([60, 61, 62, 52], 90).regression, true);
});

test("trendOf: la racha en la meta cuenta solo las sesiones SEGUIDAS al final; con tolerancia de 8°", () => {
  assert.equal(trendOf([60, 85, 88, 90, 91], 90).reached_streak, 4); // 85 ≥ 90 − 8
  assert.equal(trendOf([85, 70, 88, 90], 90).reached_streak, 2); // el 70 la corta
  assert.equal(trendOf([60, 65], 90).reached_streak, 0);
});

test("trendOf: pocas sesiones no inventan tendencia; sin datos no falla", () => {
  assert.equal(trendOf([60, 70], 90).improving, false); // se piden al menos 3 sesiones
  const none = trendOf([], 90);
  assert.deepEqual([none.sessions, none.last, none.remaining, none.improving, none.plateau], [0, null, null, false, false]);
  assert.equal(trendOf([NaN, 60, NaN], 90).sessions, 1);
});

test("trendOf: «lo que falta» no es negativo al pasar la meta", () => {
  assert.equal(trendOf([60, 70, 80], 90).remaining, 10);
  assert.equal(trendOf([95], 90).remaining, 0);
});

// ------------------------------------------------------------------ para el paciente

test("primera sesión: punto de partida, sin comparar con nadie", () => {
  assert.deepEqual(codes(run([45])).h, ["first_record"]);
});

test("llegar a la meta se celebra una sola vez y tiene prioridad sobre el resto", () => {
  const r = run([70, 80, 88]);
  assert.equal(r.patient.highlights[0].code, "reached_target");
  assert.equal(r.patient.highlights[0].data.best, 88);
  assert.ok(!codes(r).h.includes("improving") && !codes(r).h.includes("new_best"));
});

test("nuevo mejor: exige superar el anterior por MÁS que el margen de error", () => {
  assert.ok(codes(run([50, 56, 62])).h.includes("new_best"));
  assert.ok(!codes(run([50, 56, 58])).h.includes("new_best")); // +2° no es noticia
});

test("mejora sostenida: cuenta la ganancia y las sesiones, y cita el estudio del margen de error", () => {
  const r = run([40, 46, 52, 58]);
  const h = r.patient.highlights.find((x) => x.code === "improving");
  assert.deepEqual([h.data.from, h.data.to, h.data.sessions], [40, 58, 4]);
  assert.deepEqual(h.evidence, ["russo2026"]);
});

test("cerca de la meta y mejorando: dice cuánto falta, y eso va antes que «vienes mejorando»", () => {
  const r = run([60, 68, 75, 81.9]); // 81,9° no llega a 82° (meta 90 − 8): faltan 8°
  const h = r.patient.highlights;
  assert.equal(h.find((x) => x.code === "close_to_target").data.remaining, 8);
  assert.deepEqual(h.map((x) => x.code), ["new_best", "close_to_target"]); // con el tope de 2, «te faltan 8°» desplaza a «vienes mejorando»
  assert.ok(!codes(run([50, 58, 66, 70])).h.includes("close_to_target")); // faltan 20°: todavía no
  assert.ok(!codes(run([60, 61, 59, 60])).h.includes("close_to_target")); // sin mejora no hay «ya casi»
});

test("lo que se trabaja en la próxima sesión sale del análisis del video de HOY", () => {
  const r = run([50, 55, 60], { current: analysisWith("fast_up", "short_hold", "posture") });
  assert.deepEqual(codes(r).f, ["slow_down", "hold_longer"]); // máximo 2
  assert.equal(coach({ exercise: KNEE, plan: plan(), history: hist([50]), current: analysisWith("posture") }).patient.focus[0].action.type, "library");
  assert.equal(coach({ exercise: KNEE, plan: plan(), history: hist([50]), current: analysisWith("low_visibility") }).patient.focus[0].evidence[0], "barzegar2024");
  assert.equal(coach({ exercise: KNEE, plan: plan(), history: hist([50]), current: analysisWith("fatigue") }).patient.focus[0].code, "rest_between");
  assert.equal(coach({ exercise: KNEE, plan: plan(), history: hist([50]), current: analysisWith("irregular_rhythm") }).patient.focus[0].code, "steady_rhythm");
});

test("sin análisis del video (sesión antigua) solo se usa la tendencia: no falla ni inventa observaciones", () => {
  const r = run([50, 55, 60], { current: null });
  assert.deepEqual(r.patient.focus, []);
});

test("cuándo avisar al fisioterapeuta: retroceso tiene prioridad sobre estancamiento y solo se muestra UNO", () => {
  assert.deepEqual(codes(run([60, 61, 62, 50])).c, ["regression"]);
  assert.deepEqual(codes(run([60, 61, 59, 62, 60])).c, ["plateau"]);
  const both = run([60, 61, 59, 62, 60], { recentSessions: 0 }); // además, poca adherencia
  assert.equal(both.patient.care.length, COACH.maxCare);
});

test("adherencia: no se juzga en un plan nuevo; con 14 días o más y menos de la mitad de las sesiones, se avisa", () => {
  assert.ok(!codes(run([50, 55], { recentSessions: 0, planAgeDays: 5 })).c.includes("low_adherence"));
  const r = run([50, 55], { recentSessions: 2, planAgeDays: 20 }); // esperadas: 4/semana × 2 = 8
  assert.deepEqual(r.patient.care[0].data, { done: 2, expected: 8 });
  assert.deepEqual(r.patient.care[0].evidence, ["jack2010"]);
  assert.equal(r.adherence, 0.25);
  assert.ok(!codes(run([50, 55], { recentSessions: 5, planAgeDays: 20 })).c.includes("low_adherence"));
});

test("cansancio repetido: se avisa solo si pasó en al menos 2 de las últimas 3 sesiones", () => {
  const h = hist([60, 60, 60]);
  h[1].drop_pct = 20; h[2].drop_pct = 25;
  assert.ok(codes(coach({ exercise: KNEE, plan: plan(), history: h, recentSessions: 8, planAgeDays: 30 })).c.includes("repeated_fatigue"));
  h[1].drop_pct = 0;
  assert.ok(!codes(coach({ exercise: KNEE, plan: plan(), history: h, recentSessions: 8, planAgeDays: 30 })).c.includes("repeated_fatigue"));
});

// ------------------------------------------------------------------ para el fisioterapeuta

test("PROPUESTA: tres sesiones seguidas en la meta → subir la meta 5° (rodilla: el ángulo BAJA; hombro: SUBE)", () => {
  const knee = run([86, 88, 90]);
  const r = knee.therapist.find((t) => t.code === "raise_target");
  assert.deepEqual(r.proposal, { plan_id: 7, field: "target_angle", from: 90, value: 85 }); // más flexión = menor ángulo interno
  assert.deepEqual([r.data.target, r.data.next], [90, 95]);
  const sh = coach({ exercise: SHOULDER, plan: plan({ target_angle: 150 }), phase: "fortalecimiento", history: hist([145, 148, 150]), recentSessions: 8, planAgeDays: 30 });
  const rs = sh.therapist.find((t) => t.code === "raise_target");
  assert.deepEqual(rs.proposal, { plan_id: 7, field: "target_angle", from: 150, value: 155 });
});

test("en la etapa de protección no se propone mover la meta: solo se informa", () => {
  const r = run([86, 88, 90], { phase: "proteccion" }).therapist.find((t) => t.code === "raise_target");
  assert.equal(r.proposal, null);
  assert.equal(r.data.protect, true);
});

test("la meta propuesta nunca sale del rango 0–180", () => {
  const r = coach({ exercise: KNEE, plan: plan({ target_angle: 2 }), history: hist([176, 177, 178]), recentSessions: 8, planAgeDays: 30 });
  const p = r.therapist.find((t) => t.code === "raise_target").proposal;
  assert.equal(p?.value ?? 0, 0); // 2 − 5 < 0 se limita a 0
  const top = coach({ exercise: SHOULDER, plan: plan({ target_angle: 180 }), history: hist([174, 176, 178]), recentSessions: 8, planAgeDays: 30 });
  assert.equal(top.therapist.find((t) => t.code === "raise_target").proposal, null); // 180 + 5 → 180: no hay cambio que proponer
});

test("PROPUESTA: fatiga repetida → menos repeticiones por serie, sin bajar de 5", () => {
  const h = hist([60, 60, 60]);
  h[1].drop_pct = 20; h[2].drop_pct = 25;
  const r = coach({ exercise: KNEE, plan: plan(), history: h, recentSessions: 8, planAgeDays: 30 }).therapist.find((t) => t.code === "reduce_volume");
  assert.deepEqual(r.proposal, { plan_id: 7, field: "reps_per_set", from: 10, value: 8 });
  const low = coach({ exercise: KNEE, plan: plan({ reps_per_set: 5 }), history: h, recentSessions: 8, planAgeDays: 30 }).therapist.find((t) => t.code === "reduce_volume");
  assert.equal(low.proposal, null); // ya está en el mínimo
});

test("estancamiento y retroceso piden REEVALUAR (sin proponer cambios automáticos) y citan el margen de error", () => {
  const p = run([60, 61, 59, 62, 60]).therapist.find((t) => t.code === "plateau_review");
  assert.equal(p.proposal, null);
  assert.equal(p.data.noise, COACH.noiseFloorDeg);
  assert.deepEqual(p.evidence, ["russo2026"]);
  assert.equal(run([60, 61, 62, 50]).therapist.find((t) => t.code === "regression_review").proposal, null);
});

test("recurrencias: postura, cámara y ritmo rápido solo si pasan en 2 de las últimas 3 sesiones", () => {
  const h = hist([60, 60, 60]);
  h[1].flagged_pct = 50; h[2].flagged_pct = 40; h[0].low_visibility = true; h[2].low_visibility = true; h[1].fast = true; h[2].fast = true;
  const t = codes(coach({ exercise: KNEE, plan: plan(), history: h, recentSessions: 8, planAgeDays: 30 })).t;
  for (const c of ["posture_recurrent", "camera_recurrent", "tempo_recurrent"]) assert.ok(t.includes(c), c);
  assert.deepEqual(codes(run([60, 60, 60])).t.filter((c) => /recurrent/.test(c)), []);
});

// ------------------------------------------------------------------ cobertura y robustez

test("el asistente solo produce los códigos declarados, y todos se pueden producir (las pantallas deben tener texto para cada uno)", () => {
  const seenP = new Set(), seenT = new Set();
  const take = (r) => {
    for (const g of Object.values(r.patient)) for (const x of g) seenP.add(x.code);
    for (const x of r.therapist) seenT.add(x.code);
  };
  // lo que se trabaja en la próxima sesión: una observación del video por vez (el tope es de 2 por grupo)
  for (const code of ["fast_up", "fast_down", "short_hold", "fatigue", "posture", "low_visibility", "irregular_rhythm"]) take(run([50, 55, 60], { current: analysisWith(code) }));
  // logros y avisos
  take(run([45]));
  take(run([50, 56, 62]));
  take(run([40, 46, 52, 58]));
  take(run([60, 68, 75, 81.9]));
  take(run([60, 61, 59, 62, 60]));
  take(run([60, 61, 62, 50]));
  take(run([86, 88, 90]));
  take(run([40, 48, 56], { recentSessions: 1 })); // poca adherencia
  const h = hist([40, 48, 56]);
  h[1].drop_pct = 20; h[2].drop_pct = 25; h[1].flagged_pct = 50; h[2].flagged_pct = 40; h[0].low_visibility = true; h[2].low_visibility = true; h[1].fast = true; h[2].fast = true;
  take(coach({ exercise: KNEE, plan: plan(), phase: "movilidad", history: h, recentSessions: 8, planAgeDays: 30 }));
  take(coach({ exercise: KNEE, plan: plan(), phase: "movilidad", history: hist([61, 62, 66, 66]).map((x, i) => ({ ...x, flagged_pct: 0 })), recentSessions: 8, planAgeDays: 30 }));
  assert.deepEqual([...seenP].sort(), [...COACH_CODES.patient].sort());
  assert.deepEqual([...seenT].sort(), [...COACH_CODES.therapist].sort());
});

test("solo cita estudios verificados y relacionados con el tema", () => {
  const allowed = new Set(["russo2026", "barzegar2024", "jack2010", "soucie2011"]);
  const h = hist([86, 88, 90]);
  h[1].drop_pct = 20; h[2].drop_pct = 25; h[0].low_visibility = true; h[2].low_visibility = true;
  const r = coach({ exercise: KNEE, plan: plan(), history: h, current: analysisWith("low_visibility"), recentSessions: 1, planAgeDays: 30 });
  for (const x of [...Object.values(r.patient).flat(), ...r.therapist]) for (const ev of x.evidence) assert.ok(allowed.has(ev), `${x.code} cita ${ev}`);
});

test("historial vacío o con datos faltantes no rompe", () => {
  const r = coach({ exercise: KNEE, plan: plan(), history: [], recentSessions: 0, planAgeDays: 0 });
  assert.deepEqual([r.patient.highlights, r.patient.focus, r.patient.care, r.therapist], [[], [], [], []]);
  assert.doesNotThrow(() => coach({ exercise: KNEE, plan: plan({ times_per_week: 0 }), history: hist([50, 55, 60]), recentSessions: 0, planAgeDays: 40 }));
  assert.equal(coach({ exercise: KNEE, plan: plan({ times_per_week: 0 }), history: hist([50]), recentSessions: 0, planAgeDays: 40 }).adherence, null);
});

test("los topes de elementos por grupo se respetan", () => {
  const r = run([40, 46, 52, 58], { current: analysisWith("fast_up", "short_hold", "fatigue", "posture") });
  assert.ok(r.patient.highlights.length <= COACH.maxHighlights && r.patient.focus.length <= COACH.maxFocus && r.patient.care.length <= COACH.maxCare);
});
