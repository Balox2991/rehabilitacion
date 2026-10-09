import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { flexion, progressPct } from "../src/analytics.js";

// Reloj fijo: las pruebas no dependen del día en que se corren.
const NOW = new Date("2026-09-20T15:00:00Z");
const daysAgo = (n, hour = 10) => {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

let server, base;
before(async () => {
  server = createApp(openDb(":memory:"), { now: () => NOW }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const user = async (data) => (await call("POST", "/users", data)).body;
const plan = async (pid, data) => (await call("POST", `/patients/${pid}/plans`, data)).body;
const session = (pid, data) => call("POST", `/patients/${pid}/sessions`, data);
const knee = (started_at, angles, flags = {}) => ({
  exercise_code: "knee_flexion", side: "right", target_angle: 90, started_at,
  reps: angles.map((a, i) => ({ rom_achieved: a, compensation_flags: flags[i] ?? [] })),
});

test("flexión: 0 en reposo, crece con el movimiento en ambas direcciones", () => {
  assert.equal(flexion("decreasing", 175), 5);
  assert.equal(flexion("decreasing", 90), 90);
  assert.equal(flexion("increasing", 150), 150);
});

test("progreso: porcentaje del camino entre reposo y objetivo, acotado a 0–100", () => {
  const rodilla = { direction: "decreasing", rest_angle: 175 };
  assert.equal(progressPct(rodilla, 90, 175), 0);
  assert.equal(progressPct(rodilla, 90, 132.5), 50);
  assert.equal(progressPct(rodilla, 90, 90), 100);
  assert.equal(progressPct(rodilla, 90, 70), 100); // más allá del objetivo no pasa de 100
  assert.equal(progressPct(rodilla, 90, 179), 0); // peor que el reposo no baja de 0
  assert.equal(progressPct({ direction: "increasing", rest_angle: 15 }, 150, 82.5), 50);
  assert.equal(progressPct(rodilla, 90, null), null);
});

test("overview del paciente: racha, plan, progreso y adherencia semanal", async () => {
  const t = await user({ role: "therapist", name: "Dra. Prueba", email: "t1@x.co" });
  const p = await user({ role: "patient", name: "Ana", email: "ana@x.co", therapist_id: t.id, injury_date: "2026-08-20" });
  await plan(p.id, { exercise_code: "knee_flexion", side: "right", times_per_week: 3 });
  // Sesiones hoy, ayer y anteayer (racha 3), y otra hace 6 días tras un hueco.
  await session(p.id, knee(daysAgo(6), [140, 135]));
  await session(p.id, knee(daysAgo(2), [120, 118]));
  await session(p.id, knee(daysAgo(1), [110, 104]));
  await session(p.id, knee(daysAgo(0, 9), [100, 95, 97], { 1: ["Inclinación de tronco"] }));

  const { status, body } = await call("GET", `/patients/${p.id}/overview`);
  assert.equal(status, 200);
  assert.equal(body.patient.days_since_injury, 31);
  assert.equal(body.patient.therapist_name, "Dra. Prueba");
  assert.equal(body.streak_days, 3);
  assert.equal(body.totals.sessions, 4);
  assert.equal(body.totals.reps, 9);
  assert.equal(body.last_7_days.length, 7);
  assert.equal(body.last_7_days.at(-1).sessions, 1);
  const pl = body.plans[0];
  assert.equal(pl.done_7d, 3); // 4 sesiones en 7 días, pero el plan pide 3: no pasa de lo prescrito
  assert.equal(pl.latest_flexion, 85); // mejor ángulo 95 → 180 − 95
  assert.equal(pl.target_flexion, 90);
  assert.equal(pl.progress_pct, 94); // (85 − 5) / (90 − 5)
  assert.deepEqual(pl.history.map((h) => h.flexion), [45, 62, 76, 85]); // mejor rep de cada sesión: 135, 118, 104, 95 → 180 − ángulo
});

test("la racha sigue viva si hoy aún no hay sesión pero ayer sí, y se corta con un día vacío", async () => {
  const p = await user({ role: "patient", name: "Bea", email: "bea@x.co" });
  await session(p.id, knee(daysAgo(1), [100]));
  await session(p.id, knee(daysAgo(2), [100]));
  await session(p.id, knee(daysAgo(4), [100])); // hueco el día 3
  assert.equal((await call("GET", `/patients/${p.id}/overview`)).body.streak_days, 2);
  const q = await user({ role: "patient", name: "Cam", email: "cam@x.co" });
  await session(q.id, knee(daysAgo(2), [100])); // ayer y hoy vacíos
  assert.equal((await call("GET", `/patients/${q.id}/overview`)).body.streak_days, 0);
});

test("resumen del fisioterapeuta: estados, alertas y KPIs", async () => {
  const t = await user({ role: "therapist", name: "Dra. Resumen", email: "t2@x.co" });
  const mk = async (name, email, extra = {}) => user({ role: "patient", name, email, therapist_id: t.id, injury_date: "2026-08-01", ...extra });

  const activo = await mk("Activo", "activo@x.co");
  await plan(activo.id, { exercise_code: "knee_flexion", side: "right", times_per_week: 2 });
  await session(activo.id, knee(daysAgo(1), [120, 110]));
  await session(activo.id, knee(daysAgo(3), [125, 118]));

  const inactivo = await mk("Inactivo", "inactivo@x.co");
  await plan(inactivo.id, { exercise_code: "knee_flexion", side: "right", times_per_week: 3 });
  await session(inactivo.id, knee(daysAgo(9), [130]));

  const compensa = await mk("Compensa", "compensa@x.co");
  await plan(compensa.id, { exercise_code: "knee_flexion", side: "right", times_per_week: 2 });
  const tr = ["Inclinación de tronco"];
  await session(compensa.id, knee(daysAgo(1), [120, 115, 112, 110], { 0: tr, 1: tr, 2: ["Elevación de cadera"] })); // 3 de 4 reps

  const enMeta = await mk("EnMeta", "enmeta@x.co");
  await plan(enMeta.id, { exercise_code: "knee_flexion", side: "right", times_per_week: 1 });
  await session(enMeta.id, knee(daysAgo(2), [92, 88]));

  const sinPlan = await mk("SinPlan", "sinplan@x.co");

  const { status, body } = await call("GET", `/therapists/${t.id}/summary`);
  assert.equal(status, 200);
  const st = Object.fromEntries(body.patients.map((r) => [r.name, r]));
  assert.equal(st.Activo.status, "al_dia");
  assert.equal(st.Inactivo.status, "sin_actividad");
  assert.equal(st.Inactivo.days_since_last_session, 9);
  assert.equal(st.Compensa.status, "compensaciones");
  assert.equal(st.Compensa.compensation_rate_30d, 75);
  assert.equal(st.EnMeta.status, "en_meta");
  assert.equal(st.EnMeta.progress_pct, 100);
  assert.equal(st.SinPlan.status, "sin_plan");
  assert.equal(st.SinPlan.adherence_pct, null);

  // Quien necesita atención va primero.
  assert.deepEqual(body.patients.slice(0, 2).map((r) => r.status), ["sin_actividad", "compensaciones"]);

  assert.equal(body.kpis.patients, 5);
  assert.equal(body.kpis.needing_attention, 2);
  assert.equal(body.kpis.sessions_7d, 4); // Inactivo (hace 9 días) no cuenta
  // Adherencia: Activo 2/2 + Inactivo 0/3 + Compensa 1/2 + EnMeta 1/1 = 4 de 8
  assert.equal(body.kpis.adherence_pct, 50);
  assert.deepEqual(body.compensation_breakdown, [
    { flag: "Inclinación de tronco", count: 2 },
    { flag: "Elevación de cadera", count: 1 },
  ]);
  assert.equal(body.weekly_sessions.length, 8);
  assert.equal(body.weekly_sessions.at(-1).sessions, 4); // última ventana: los últimos 7 días
  assert.equal(body.weekly_sessions.at(-2).sessions, 1); // la sesión de hace 9 días
});

test("resumen de un fisioterapeuta sin pacientes no falla", async () => {
  const t = await user({ role: "therapist", name: "Vacía", email: "vacia@x.co" });
  const { status, body } = await call("GET", `/therapists/${t.id}/summary`);
  assert.equal(status, 200);
  assert.equal(body.kpis.patients, 0);
  assert.equal(body.kpis.adherence_pct, null);
  assert.deepEqual(body.patients, []);
});

test("overview y summary devuelven 404 para ids que no son del rol correcto", async () => {
  assert.equal((await call("GET", "/patients/9999/overview")).status, 404);
  assert.equal((await call("GET", "/therapists/9999/summary")).status, 404);
  const t = await user({ role: "therapist", name: "X", email: "t9@x.co" });
  assert.equal((await call("GET", `/patients/${t.id}/overview`)).status, 404);
});

test("zona horaria: 'hoy', la racha y 'última sesión' se cuentan en el día local del usuario, no en UTC", async () => {
  // Ahora = 21 sep 03:37 UTC = domingo 20 sep 22:37 en Colombia (UTC-5).
  const late = new Date("2026-09-21T03:37:00Z");
  const s2 = createApp(openDb(":memory:"), { now: () => late }).listen(0);
  await new Promise((r) => s2.once("listening", r));
  const b2 = `http://localhost:${s2.address().port}`;
  const c2 = async (m, p, body) => {
    const r = await fetch(b2 + p, { method: m, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  try {
    const t = (await c2("POST", "/users", { role: "therapist", name: "T", email: "tz@x.co" })).body;
    const p = (await c2("POST", "/users", { role: "patient", name: "P", email: "tzp@x.co", therapist_id: t.id, injury_date: "2026-09-10" })).body;
    await c2("POST", `/patients/${p.id}/plans`, { exercise_code: "knee_flexion", side: "right" });
    const ses = (at) => c2("POST", `/patients/${p.id}/sessions`, knee(at, [100]));
    await ses("2026-09-21T01:00:00Z"); // 20 sep 20:00 local → HOY para el usuario
    await ses("2026-09-20T04:00:00Z"); // 19 sep 23:00 local → ayer para el usuario

    const utc = (await c2("GET", `/patients/${p.id}/overview`)).body;
    const co = (await c2("GET", `/patients/${p.id}/overview?tz=-300`)).body;
    assert.equal(utc.last_7_days.at(-1).date, "2026-09-21"); // sin tz: día UTC
    assert.equal(co.last_7_days.at(-1).date, "2026-09-20"); // con tz: el domingo local
    assert.equal(co.last_7_days.at(-1).sessions, 1);
    assert.equal(co.streak_days, 2); // hoy y ayer (locales)
    assert.equal(co.patient.days_since_injury, 10); // del 10 al 20 sep local

    const sum = (await c2("GET", `/therapists/${t.id}/summary?tz=-300`)).body;
    assert.equal(sum.patients[0].days_since_last_session, 0); // la última sesión fue hoy (local)

    // Solo con la sesión del 19 local: ayer para el usuario (calendario), aunque hayan pasado < 24 h.
    const q = (await c2("POST", "/users", { role: "patient", name: "Q", email: "tzq@x.co", therapist_id: t.id })).body;
    await c2("POST", `/patients/${q.id}/plans`, { exercise_code: "knee_flexion", side: "right" });
    await c2("POST", `/patients/${q.id}/sessions`, knee("2026-09-20T04:00:00Z", [100]));
    const sum2 = (await c2("GET", `/therapists/${t.id}/summary?tz=-300`)).body;
    assert.equal(sum2.patients.find((r) => r.name === "Q").days_since_last_session, 1);

    assert.equal((await c2("GET", `/patients/${p.id}/overview?tz=abc`)).status, 400);
    assert.equal((await c2("GET", `/patients/${p.id}/overview?tz=99999`)).status, 400);
  } finally {
    s2.close();
  }
});
