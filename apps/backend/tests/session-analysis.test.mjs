import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb, SCHEMA_VERSION } from "../src/db.js";
import { createApp } from "../src/app.js";
import { generateReps } from "../../tracking-prototype/tests/helpers/signals.mjs";

let server, base, db, therapist, patient, planId;

before(async () => {
  db = openDb(":memory:");
  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
  therapist = await call("POST", "/users", { role: "therapist", name: "Dra. Ruiz", email: "ruiz@clinica.co" });
  patient = await call("POST", "/users", { role: "patient", name: "Carlos Pérez", email: "carlos@mail.com", therapist_id: therapist.body.id });
  const plan = await call("POST", `/patients/${patient.body.id}/plans`, { exercise_code: "knee_flexion", side: "right", created_by: therapist.body.id, sets: 1, reps_per_set: 10 });
  planId = plan.body.id;
});
after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

function makeTrace({ reps = 8, peakAngle = 90, skeleton = true, ...gen } = {}) {
  const samples = generateReps({ reps, restAngle: 175, peakAngle, noiseSd: 2, seed: 4, ...gen });
  const t = samples.map((s) => s[1]);
  return {
    format: "telerehab-trace/2",
    meta: { width: 640, height: 480, model: "full" },
    t,
    angle: samples.map((s) => Math.round(s[0] * 10) / 10),
    vis: t.map(() => 1),
    skeleton: skeleton ? { joints: ["right_hip", "right_knee", "right_ankle"], stride: 2, frames: t.filter((_, i) => i % 2 === 0).map(() => [400, 200, 400, 300, 450, 400]) } : undefined,
    flags: [[0, []]],
  };
}
const sessionBody = (trace, over = {}) => ({
  exercise_code: "knee_flexion", side: "right", target_angle: 90, plan_id: planId,
  started_at: "2026-10-05T15:00:00.000Z", ended_at: "2026-10-05T15:02:00.000Z",
  reps: Array.from({ length: 8 }, () => ({ rom_achieved: 90, compensation_flags: [] })),
  ...(trace === undefined ? {} : { trace }), ...over,
});

test("la migración 4 existe y deja la tabla de análisis", () => {
  assert.equal(SCHEMA_VERSION, 5);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'session_analysis'").get());
});

test("una sesión sin registro se sigue guardando como antes (sin análisis)", async () => {
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(undefined));
  assert.equal(r.status, 201);
  assert.equal(r.body.analysis, null);
  assert.equal(r.body.has_trace, false);
  assert.equal((await call("GET", `/sessions/${r.body.id}/trace`)).status, 404);
});

let sessionId;
test("con registro: el SERVIDOR lo analiza y guarda el resumen", async () => {
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(makeTrace()));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  sessionId = r.body.id;
  assert.equal(r.body.has_trace, true);
  const a = r.body.analysis;
  assert.equal(a.summary.count, 8);
  assert.equal(a.reps.length, 8);
  assert.equal(a.analyzer_version, 1);
  assert.ok(a.summary.rom.best >= 85);
  assert.ok(Array.isArray(a.suggestions) && a.suggestions.length > 0);
  assert.ok(!("trace" in r.body), "la respuesta no arrastra el registro pesado");
});

test("el análisis usa los datos de la BASE (meta del plan), no lo que afirme el cliente en el registro", async () => {
  const trace = makeTrace({ peakAngle: 108 });
  trace.meta.targetAngle = 108; // el cliente intenta «bajar la vara»
  trace.meta.direction = "increasing";
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(trace, { target_angle: 90 }));
  assert.equal(r.status, 201);
  assert.equal(r.body.analysis.summary.reached_target, 0); // 108° no llega a la meta de 90°
  const stored = (await call("GET", `/sessions/${r.body.id}/trace`)).body;
  assert.equal(stored.meta.direction, "decreasing");
  assert.equal(stored.meta.targetAngle, 90);
});

test("GET /sessions/:id/trace devuelve el registro para reproducir el movimiento", async () => {
  const r = await call("GET", `/sessions/${sessionId}/trace`);
  assert.equal(r.status, 200);
  assert.equal(r.body.format, "telerehab-trace/2");
  assert.equal(r.body.meta.exercise, "knee_flexion");
  assert.deepEqual(r.body.skeleton.joints, ["right_hip", "right_knee", "right_ankle"]);
  assert.equal((await call("GET", "/sessions/999999/trace")).status, 404);
  assert.equal((await call("GET", "/sessions/abc/trace")).status, 400); // id mal formado
});

test("el servidor aplica el análisis de la sesión esperada: faltan repeticiones respecto al plan", async () => {
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(makeTrace({ reps: 3 })));
  assert.equal(r.body.analysis.summary.expected, 10); // plan: 1 serie × 10
  assert.ok(r.body.analysis.suggestions.some((s) => s.code === "incomplete"));
});

test("rehacer el análisis desde el registro guardado", async () => {
  db.prepare("UPDATE session_analysis SET analyzer_version = 0, summary = '{\"viejo\":true}' WHERE session_id = ?").run(sessionId);
  const r = await call("POST", `/sessions/${sessionId}/analysis`);
  assert.equal(r.status, 200);
  assert.equal(r.body.analysis.analyzer_version, 1);
  assert.equal(r.body.analysis.summary.count, 8);
  assert.equal((await call("POST", "/sessions/999999/analysis")).status, 404);
  const noTrace = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(undefined));
  assert.equal((await call("POST", `/sessions/${noTrace.body.id}/analysis`)).status, 404);
});

test("un registro inválido se rechaza con 400 y NO deja la sesión a medias", async () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n;
  const bad = makeTrace();
  bad.angle[3] = 400;
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(bad));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /angle\[3\]/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, before);
});

test("el límite de 3 MB aplica solo a las sesiones; otras rutas siguen en 100 KB; y se corta por encima de 3 MB", async () => {
  const notes = await call("POST", `/patients/${patient.body.id}/notes`, { author_id: therapist.body.id, body: "x".repeat(150_000) });
  assert.equal(notes.status, 413);
  const huge = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(undefined, { notes: "x".repeat(3_200_000) }));
  assert.equal(huge.status, 413);
  // un registro realista (≈ 2 min a 30 fps, con esqueleto) cabe de sobra
  const trace = makeTrace({ reps: 20, holdMs: 800 });
  const all12 = ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"];
  trace.skeleton = { joints: all12, stride: 1, frames: trace.t.map((_, i) => all12.flatMap((__, k) => [400 + ((i + k) % 90), 200 + ((i * 3 + k) % 80)])) };
  const size = JSON.stringify(trace).length;
  assert.ok(size > 100_000 && size < 3_000_000, `tamaño ${size}`);
  assert.equal((await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(trace))).status, 201);
});

test("borrar la sesión borra su análisis (ON DELETE CASCADE)", () => {
  db.exec("PRAGMA foreign_keys = ON");
  const n = db.prepare("SELECT COUNT(*) AS n FROM session_analysis WHERE session_id = ?").get(sessionId).n;
  assert.equal(n, 1);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM session_analysis WHERE session_id = ?").get(sessionId).n, 0);
});

test("las repeticiones guardadas son las del análisis del servidor, no las que afirme el cliente (una sola fuente de verdad)", async () => {
  const fake = Array.from({ length: 3 }, () => ({ rom_achieved: 20, compensation_flags: [] })); // el cliente dice 3 repeticiones de 20°
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(makeTrace({ reps: 8 }), { reps: fake }));
  assert.equal(r.status, 201);
  assert.equal(r.body.reps_completed, 8);
  assert.equal(r.body.reps.length, 8);
  assert.equal(r.body.analysis.summary.count, r.body.reps.length);
  assert.ok(r.body.reps.every((x) => x.rom_achieved > 80 && x.rom_achieved < 100), "los ROM salen del análisis, no del 20° declarado");
  assert.ok(r.body.best_rom < 100);
});

test("si el análisis no halla repeticiones pero el cliente sí contó, se conserva lo del cliente (la sesión no se pierde)", async () => {
  const still = makeTrace({ reps: 0, leadMs: 6000 });
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(still, { reps: [{ rom_achieved: 100, compensation_flags: [] }, { rom_achieved: 95, compensation_flags: [] }] }));
  assert.equal(r.status, 201);
  assert.equal(r.body.reps_completed, 2);
  assert.equal(r.body.analysis.summary.count, 0);
});

test("las alertas de postura del registro pasan a cada repetición guardada", async () => {
  const t = makeTrace({ reps: 6 });
  t.flags = [[0, ["Inclinación de tronco"]]];
  const r = await call("POST", `/patients/${patient.body.id}/sessions`, sessionBody(t));
  assert.equal(r.body.compensation_count, 6);
  assert.deepEqual(r.body.reps[0].compensation_flags, ["Inclinación de tronco"]);
});
