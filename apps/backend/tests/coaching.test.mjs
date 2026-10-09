import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { generateReps } from "../../tracking-prototype/tests/helpers/signals.mjs";

const NOW = new Date("2026-10-06T15:00:00Z");
const day = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
let server, base, db, th;

before(async () => {
  db = openDb(":memory:");
  server = createApp(db, { now: () => NOW }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
  th = (await call("POST", "/users", { role: "therapist", name: "Dra. Asistente", email: "asistente@x.co" })).body;
});
after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

let n = 0;
// Un paciente con un plan de rodilla (meta 90° de flexión = ángulo 90). `ageDays` envejece el plan (la fecha es la del reloj real).
async function patientWithPlan({ exercise = "knee_flexion", side = "right", target, ageDays = 40, phase = "movilidad" } = {}) {
  n++;
  const p = (await call("POST", "/users", { role: "patient", name: `Paciente ${n}`, email: `p${n}@x.co`, therapist_id: th.id, injury_date: "2026-08-01" })).body;
  await call("PATCH", `/patients/${p.id}`, { recovery_phase: phase });
  const plan = (await call("POST", `/patients/${p.id}/plans`, { exercise_code: exercise, side, created_by: th.id, ...(target ? { target_angle: target } : {}) })).body;
  db.prepare("UPDATE exercise_plans SET created_at = ? WHERE id = ?").run(new Date(NOW.getTime() - ageDays * 86_400_000).toISOString().replace("T", " ").slice(0, 19), plan.id);
  return { p, plan };
}
// Guarda una sesión con un mejor movimiento (en grados de flexión de rodilla: ángulo = 180 − flexión) hace `daysAgo` días.
const addSession = (p, plan, flex, daysAgo, { reps = 10, trace } = {}) =>
  call("POST", `/patients/${p.id}/sessions`, {
    exercise_code: "knee_flexion", side: plan.side, target_angle: plan.target_angle, plan_id: plan.id, started_at: day(daysAgo),
    reps: Array.from({ length: reps }, () => ({ rom_achieved: 180 - flex, compensation_flags: [] })), ...(trace ? { trace } : {}),
  });
const coachOf = async (p, q = "") => (await call("GET", `/patients/${p.id}/coach${q}`)).body;

test("sin sesiones: el plan aparece con todo vacío, sin errores (y si el plan es VIEJO y nunca empezó, se avisa a su fisioterapeuta)", async () => {
  const stale = await patientWithPlan({ ageDays: 40 });
  const s = (await coachOf(stale.p)).plans[0];
  assert.deepEqual(s.therapist.map((t) => t.code), ["low_adherence"]); // 0 de 8 sesiones en 2 semanas
  assert.deepEqual(s.patient.care.map((c) => c.code), ["low_adherence"]);
  const { p } = await patientWithPlan({ ageDays: 3 });
  const r = await coachOf(p);
  assert.equal(r.plans.length, 1);
  assert.deepEqual([r.plans[0].sessions, r.plans[0].session_id, r.plans[0].patient.highlights, r.plans[0].therapist], [0, null, [], []]);
  assert.deepEqual(r.evidence, []);
});

test("primera sesión: punto de partida; y el paciente no ve a nadie más en su respuesta", async () => {
  const { p, plan } = await patientWithPlan();
  await addSession(p, plan, 45, 1);
  const r = await coachOf(p);
  assert.equal(r.plans[0].patient.highlights[0].code, "first_record");
  assert.equal(r.plans[0].patient.highlights[0].data.best, 45);
  assert.equal(r.plans[0].exercise_code, "knee_flexion");
  assert.equal(r.plans[0].library_code, "knee_flexion", "enlaza a su ficha de la biblioteca");
});

test("mejora sostenida: el servidor arma el historial y cita el estudio del margen de error, completo y con su límite", async () => {
  const { p, plan } = await patientWithPlan();
  for (const [f, d] of [[40, 12], [47, 9], [53, 6], [60, 3]]) await addSession(p, plan, f, d);
  const r = await coachOf(p);
  const h = r.plans[0].patient.highlights.map((x) => x.code);
  assert.ok(h.includes("new_best") || h.includes("improving"));
  const imp = r.plans[0].patient.highlights.find((x) => x.code === "improving");
  assert.deepEqual([imp.data.from, imp.data.to], [40, 60]);
  const ev = r.evidence.find((e) => e.code === "russo2026");
  assert.ok(ev.url.startsWith("https://") && ev.limitation.length > 20, "se entrega la evidencia con lo que NO demuestra");
  assert.equal(r.plans[0].trend.improving, true);
});

test("tres sesiones seguidas en la meta: se PROPONE subir la meta, y la propuesta se puede aplicar con el PATCH existente", async () => {
  const { p, plan } = await patientWithPlan();
  for (const [f, d] of [[70, 9], [86, 6], [88, 3], [90, 1]]) await addSession(p, plan, f, d);
  const t = (await coachOf(p)).plans[0].therapist.find((x) => x.code === "raise_target");
  assert.deepEqual(t.proposal, { plan_id: plan.id, field: "target_angle", from: 90, value: 85 });
  const applied = await call("PATCH", `/plans/${t.proposal.plan_id}`, { [t.proposal.field]: t.proposal.value });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.target_angle, 85);
  // con la meta nueva ya no hay racha en la meta: la propuesta desaparece (no se repite)
  const again = (await coachOf(p)).plans[0].therapist.find((x) => x.code === "raise_target");
  assert.equal(again, undefined);
});

test("en etapa de protección la meta no se propone mover", async () => {
  const { p, plan } = await patientWithPlan({ phase: "proteccion" });
  for (const [f, d] of [[86, 6], [88, 3], [90, 1]]) await addSession(p, plan, f, d);
  const t = (await coachOf(p)).plans[0].therapist.find((x) => x.code === "raise_target");
  assert.equal(t.proposal, null);
});

test("?session= fija «la sesión de hoy»: el asistente solo ve el pasado hasta esa sesión", async () => {
  const { p, plan } = await patientWithPlan();
  const ids = [];
  for (const [f, d] of [[40, 9], [50, 6], [60, 3]]) ids.push((await addSession(p, plan, f, d)).body.id);
  const first = await coachOf(p, `?session=${ids[0]}`);
  assert.equal(first.plans[0].session_id, ids[0]);
  assert.equal(first.plans[0].patient.highlights[0].code, "first_record");
  const last = await coachOf(p);
  assert.equal(last.plans[0].session_id, ids[2]);
  assert.equal((await call("GET", `/patients/${p.id}/coach?session=abc`)).status, 400);
  const other = await patientWithPlan();
  assert.deepEqual((await coachOf(other.p, `?session=${ids[0]}`)).plans, [], "una sesión de otro paciente no cuenta");
});

test("lo que dijo el análisis del VIDEO de hoy pasa a lo que se trabaja en la próxima sesión", async () => {
  const { p, plan } = await patientWithPlan();
  const samples = generateReps({ reps: 10, restAngle: 175, peakAngle: 100, moveMs: 450, holdMs: 0, pauseMs: 300, noiseSd: 1.5, seed: 4 });
  const t = samples.map((s) => s[1]);
  const trace = { format: "telerehab-trace/2", meta: { width: 640, height: 480 }, t, angle: samples.map((s) => Math.round(s[0] * 10) / 10), vis: t.map(() => 1), flags: [] };
  await addSession(p, plan, 70, 4);
  const saved = await addSession(p, plan, 80, 1, { trace });
  assert.equal(saved.status, 201);
  const r = (await coachOf(p)).plans[0];
  assert.ok(r.patient.focus.map((x) => x.code).includes("slow_down"), JSON.stringify(r.patient.focus));
});

test("adherencia: un plan de más de 14 días con pocas sesiones recientes avisa; uno nuevo no se juzga", async () => {
  const old = await patientWithPlan({ ageDays: 30 });
  await addSession(old.p, old.plan, 50, 1);
  const r = (await coachOf(old.p)).plans[0];
  assert.ok(r.patient.care.some((c) => c.code === "low_adherence"), JSON.stringify({ care: r.patient.care, trend: r.trend, adherence: r.adherence }));
  assert.ok(r.therapist.some((c) => c.code === "low_adherence"));
  assert.ok((await coachOf(old.p)).evidence.some((e) => e.code === "jack2010"));

  const fresh = await patientWithPlan({ ageDays: 3 });
  await addSession(fresh.p, fresh.plan, 50, 1);
  assert.ok(!(await coachOf(fresh.p)).plans[0].patient.care.some((c) => c.code === "low_adherence"));
});

test("cada plan se mira por separado: otro ejercicio o el otro lado no se mezclan", async () => {
  const { p, plan } = await patientWithPlan();
  await addSession(p, plan, 50, 2);
  const left = (await call("POST", `/patients/${p.id}/plans`, { exercise_code: "knee_flexion", side: "left", created_by: th.id })).body;
  await addSession(p, left, 30, 1);
  const r = await coachOf(p);
  assert.equal(r.plans.length, 2);
  const byPlan = Object.fromEntries(r.plans.map((x) => [x.plan_id, x]));
  assert.equal(byPlan[plan.id].patient.highlights[0].data.best, 50);
  assert.equal(byPlan[left.id].patient.highlights[0].data.best, 30);
});

test("un paciente que no existe responde 404", async () => {
  assert.equal((await call("GET", "/patients/999999/coach")).status, 404);
  assert.equal((await call("GET", `/patients/${th.id}/coach`)).status, 404, "un fisioterapeuta no es un paciente");
});
