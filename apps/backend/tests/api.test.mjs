import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";

let server, base, db;

before(async () => {
  db = openDb(":memory:");
  server = createApp(db).listen(0);
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

let therapist, patient;

test("el catálogo trae los ejercicios medidos con cámara, cada uno con su especificación", async () => {
  const { status, body } = await call("GET", "/exercises");
  assert.equal(status, 200);
  assert.deepEqual(body.map((e) => e.code), ["knee_flexion", "elbow_flexion", "shoulder_flexion", "straight_leg_raise"]);
  const byCode = Object.fromEntries(body.map((e) => [e.code, e]));
  assert.deepEqual(byCode.knee_flexion.spec.measure, { type: "joint_angle", points: ["hip", "knee", "ankle"] });
  assert.deepEqual(byCode.straight_leg_raise.spec.measure, { type: "segment_angle", from: "hip", to: "knee", reference: "horizontal" });
  assert.equal(byCode.straight_leg_raise.default_target_angle, 45);
  assert.equal(byCode.straight_leg_raise.direction, "increasing");
  assert.equal(byCode.straight_leg_raise.rest_angle, 0);
  for (const e of body) assert.equal(e.spec.code, e.code); // la columna spec coincide con la fila
});

test("crea fisioterapeuta y paciente asignado a él", async () => {
  const t = await call("POST", "/users", { role: "therapist", name: "Dra. Ruiz", email: "ruiz@clinica.co" });
  assert.equal(t.status, 201);
  therapist = t.body;
  const p = await call("POST", "/users", {
    role: "patient", name: "Carlos Pérez", email: "Carlos@Mail.com",
    therapist_id: therapist.id, fracture_site: "tibia derecha", injury_date: "2026-07-01",
  });
  assert.equal(p.status, 201);
  assert.equal(p.body.email, "carlos@mail.com"); // se normaliza a minúsculas
  patient = p.body;
  const list = await call("GET", `/therapists/${therapist.id}/patients`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].fracture_site, "tibia derecha");
});

test("rechaza email repetido, rol inválido y therapist_id que no es fisioterapeuta", async () => {
  assert.equal((await call("POST", "/users", { role: "patient", name: "X", email: "carlos@mail.com" })).status, 409);
  assert.equal((await call("POST", "/users", { role: "admin", name: "X", email: "x@x.co" })).status, 400);
  assert.equal((await call("POST", "/users", { role: "patient", name: "X", email: "y@y.co", therapist_id: patient.id })).status, 400);
});

test("el fisioterapeuta prescribe un plan; usa el ROM por defecto si no se indica", async () => {
  const r = await call("POST", `/patients/${patient.id}/plans`, {
    exercise_code: "knee_flexion", side: "right", created_by: therapist.id,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.target_angle, 90);
  assert.equal(r.body.sets, 3);
  const upd = await call("PATCH", `/plans/${r.body.id}`, { target_angle: 100, reps_per_set: 12 });
  assert.equal(upd.body.target_angle, 100);
  assert.equal(upd.body.reps_per_set, 12);
  assert.equal((await call("PATCH", `/plans/${r.body.id}`, { target_angle: 400 })).status, 400);
  const active = await call("GET", `/patients/${patient.id}/plans?active=1`);
  assert.equal(active.body.length, 1);
  await call("PATCH", `/plans/${r.body.id}`, { active: false });
  assert.equal((await call("GET", `/patients/${patient.id}/plans?active=1`)).body.length, 0);
});

test("guarda una sesión y calcula agregados en el servidor (ejercicio decreasing → mejor ROM = mínimo)", async () => {
  const r = await call("POST", `/patients/${patient.id}/sessions`, {
    exercise_code: "knee_flexion", side: "right", target_angle: 90,
    started_at: "2026-09-01T10:00:00Z", ended_at: "2026-09-01T10:05:00Z",
    reps: [
      { rom_achieved: 95 },
      { rom_achieved: 88, compensation_flags: ["Inclinación de tronco"] },
      { rom_achieved: 91 },
    ],
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.reps_completed, 3);
  assert.equal(r.body.best_rom, 88);
  assert.equal(r.body.compensation_count, 1);
  assert.deepEqual(r.body.reps[1].compensation_flags, ["Inclinación de tronco"]);
});

test("ejercicio increasing (hombro): mejor ROM = máximo", async () => {
  const r = await call("POST", `/patients/${patient.id}/sessions`, {
    exercise_code: "shoulder_flexion", side: "left", target_angle: 150,
    started_at: "2026-09-02T10:00:00Z", reps: [{ rom_achieved: 120 }, { rom_achieved: 140 }],
  });
  assert.equal(r.body.best_rom, 140);
});

test("historial de ROM devuelve una fila por sesión, en orden cronológico", async () => {
  await call("POST", `/patients/${patient.id}/sessions`, {
    exercise_code: "knee_flexion", side: "right", target_angle: 90,
    started_at: "2026-09-08T10:00:00Z", reps: [{ rom_achieved: 85 }, { rom_achieved: 83 }],
  });
  const h = await call("GET", `/patients/${patient.id}/rom-history?exercise=knee_flexion`);
  assert.equal(h.status, 200);
  assert.deepEqual(h.body.map((s) => s.best_rom), [88, 83]);
  assert.equal(h.body[1].avg_rom, 84);
  assert.equal((await call("GET", `/patients/${patient.id}/rom-history`)).status, 400);
});

test("una sesión inválida no deja datos a medias (transacción)", async () => {
  const before = (await call("GET", `/patients/${patient.id}/sessions`)).body.length;
  const bad = await call("POST", `/patients/${patient.id}/sessions`, {
    exercise_code: "knee_flexion", side: "right", target_angle: 90,
    started_at: "2026-09-09T10:00:00Z", reps: [{ rom_achieved: 90 }, { rom_achieved: 999 }],
  });
  assert.equal(bad.status, 400);
  assert.equal((await call("GET", `/patients/${patient.id}/sessions`)).body.length, before);
});

test("no permite usar el plan de otro paciente ni consultar pacientes inexistentes", async () => {
  const other = await call("POST", "/users", { role: "patient", name: "Ana", email: "ana@mail.com" });
  const plan = await call("POST", `/patients/${other.body.id}/plans`, { exercise_code: "elbow_flexion", side: "left" });
  const r = await call("POST", `/patients/${patient.id}/sessions`, {
    exercise_code: "elbow_flexion", side: "left", target_angle: 60, plan_id: plan.body.id,
    started_at: "2026-09-10T10:00:00Z", reps: [],
  });
  assert.equal(r.status, 400);
  assert.equal((await call("GET", "/patients/9999")).status, 404);
  assert.equal((await call("GET", `/patients/${therapist.id}`)).status, 404); // un fisioterapeuta no es paciente
});

test("JSON malformado responde 400, no 500", async () => {
  const res = await fetch(base + "/users", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
  assert.equal(res.status, 400);
});

// ---- Regresiones de errores encontrados en la revisión de la Fase 2 ----

test("plan inexistente responde 404 (no 400)", async () => {
  assert.equal((await call("PATCH", "/plans/9999", { sets: 2 })).status, 404);
});

test("las fechas de sesión se normalizan a UTC y el historial respeta el orden real en el tiempo", async () => {
  const p = (await call("POST", "/users", { role: "patient", name: "Luis", email: "luis@mail.com" })).body;
  // 23:00 hora -05:00 del día 20 = 04:00Z del día 21 → ocurre DESPUÉS de 01:00Z del 21.
  const later = await call("POST", `/patients/${p.id}/sessions`, {
    exercise_code: "elbow_flexion", side: "left", target_angle: 60,
    started_at: "2026-09-20T23:00:00-05:00", reps: [{ rom_achieved: 50 }],
  });
  const earlier = await call("POST", `/patients/${p.id}/sessions`, {
    exercise_code: "elbow_flexion", side: "left", target_angle: 60,
    started_at: "2026-09-21T01:00:00Z", reps: [{ rom_achieved: 70 }],
  });
  assert.equal(later.body.started_at, "2026-09-21T04:00:00.000Z");
  const h = await call("GET", `/patients/${p.id}/rom-history?exercise=elbow_flexion`);
  assert.deepEqual(h.body.map((s) => s.best_rom), [70, 50]); // primero la de 01:00Z, luego la de 04:00Z
  assert.equal((await call("POST", `/patients/${p.id}/sessions`, {
    exercise_code: "elbow_flexion", side: "left", target_angle: 60,
    started_at: "2026-09-21T10:00:00Z", ended_at: "2026-09-21T09:00:00Z", reps: [],
  })).status, 400); // termina antes de empezar
});

test("injury_date debe ser una fecha calendario real", async () => {
  const mk = (injury_date, email) => call("POST", "/users", { role: "patient", name: "F", email, injury_date });
  assert.equal((await mk("banana", "f1@mail.com")).status, 400);
  assert.equal((await mk("2026-02-31", "f2@mail.com")).status, 400);
  assert.equal((await mk("2026-02-28", "f3@mail.com")).status, 201);
  const id = (await mk("2026-03-01", "f4@mail.com")).body.id;
  assert.equal((await call("PATCH", `/patients/${id}`, { injury_date: "ayer" })).status, 400);
});

test("no permite dos planes activos del mismo ejercicio y lado, ni reactivar uno que choque", async () => {
  const p = (await call("POST", "/users", { role: "patient", name: "Marta", email: "marta@mail.com" })).body;
  const first = await call("POST", `/patients/${p.id}/plans`, { exercise_code: "knee_flexion", side: "left" });
  assert.equal(first.status, 201);
  assert.equal((await call("POST", `/patients/${p.id}/plans`, { exercise_code: "knee_flexion", side: "left" })).status, 409);
  // otro lado u otro ejercicio sí es válido
  assert.equal((await call("POST", `/patients/${p.id}/plans`, { exercise_code: "knee_flexion", side: "right" })).status, 201);
  await call("PATCH", `/plans/${first.body.id}`, { active: false });
  const second = await call("POST", `/patients/${p.id}/plans`, { exercise_code: "knee_flexion", side: "left" });
  assert.equal(second.status, 201);
  assert.equal((await call("PATCH", `/plans/${first.body.id}`, { active: true })).status, 409);
});

test("GET /therapists lista solo fisioterapeutas, sin exponer email", async () => {
  const { status, body } = await call("GET", "/therapists");
  assert.equal(status, 200);
  assert.ok(body.length >= 1);
  assert.ok(body.every((t) => Object.keys(t).sort().join() === "id,name"));
  assert.ok(body.some((t) => t.id === therapist.id));
});
