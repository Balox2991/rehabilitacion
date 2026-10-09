import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb, SCHEMA_VERSION } from "../src/db.js";
import { createApp } from "../src/app.js";
import { toEmbedUrl } from "../src/video.js";
import { EVIDENCE } from "../src/content/evidence.js";
import { LIBRARY } from "../src/content/library.js";
import { ROUTINES } from "../src/content/routines.js";

const NOW = new Date("2026-09-20T15:00:00Z");
let server, base, db;

before(async () => {
  db = openDb(":memory:");
  server = createApp(db, { now: () => NOW }).listen(0);
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

// ------------------------------------------------------------------ migraciones

test("migraciones: una base nueva queda en la última versión y abrirla otra vez no cambia nada", () => {
  const dir = mkdtempSync(join(tmpdir(), "telerehab-"));
  const file = join(dir, "t.db");
  try {
    const a = openDb(file);
    assert.equal(a.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
    a.prepare("UPDATE library_items SET video_url = ? WHERE code = 'knee_flexion'").run("https://youtu.be/dQw4w9WgXcQ");
    a.close();

    const b = openDb(file); // segundo arranque: el contenido base se vuelve a cargar
    assert.equal(b.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM library_items").get().n, LIBRARY.length);
    assert.equal(b.prepare("SELECT video_url FROM library_items WHERE code = 'knee_flexion'").get().video_url, "https://youtu.be/dQw4w9WgXcQ", "el contenido base no debe pisar el video de la clínica");
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migraciones: una base antigua (solo el esquema 1, con datos) se actualiza sin perder nada", () => {
  const dir = mkdtempSync(join(tmpdir(), "telerehab-"));
  const file = join(dir, "vieja.db");
  try {
    const old = new DatabaseSync(file);
    old.exec("PRAGMA foreign_keys = ON;");
    old.exec(readFileSync(new URL("../src/migrations/001_base.sql", import.meta.url), "utf8"));
    old.exec("PRAGMA user_version = 1");
    old.prepare("INSERT INTO users (role, name, email) VALUES ('therapist', 'Antigua', 'vieja@x.co')").run();
    old.close();

    const upgraded = openDb(file);
    assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
    assert.equal(upgraded.prepare("SELECT name FROM users WHERE email = 'vieja@x.co'").get().name, "Antigua");
    assert.equal(upgraded.prepare("SELECT COUNT(*) n FROM routines").get().n, ROUTINES.length);
    upgraded.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ integridad del contenido

test("contenido: referencias válidas, evidencia verificable y sin duplicados", () => {
  const evCodes = new Set(EVIDENCE.map((e) => e.code));
  assert.equal(evCodes.size, EVIDENCE.length, "códigos de evidencia repetidos");
  for (const e of EVIDENCE) {
    assert.ok(e.url.startsWith("https://"), `${e.code}: la URL debe ser https`);
    assert.ok(e.pmid || e.doi || e.url.includes("arxiv.org"), `${e.code}: necesita PMID, DOI o arXiv para poder verificarse`);
    assert.ok(e.summary.length > 60 && e.limitation.length > 20, `${e.code}: falta resumen o limitación`);
  }
  const pmids = EVIDENCE.map((e) => e.pmid).filter(Boolean);
  assert.equal(new Set(pmids).size, pmids.length, "PMID repetido");

  const libCodes = new Set(LIBRARY.map((l) => l.code));
  assert.equal(libCodes.size, LIBRARY.length);
  for (const l of LIBRARY) {
    for (const ev of l.evidence) assert.ok(evCodes.has(ev), `${l.code} cita "${ev}" que no existe`);
    if (l.category !== "educacion") assert.ok(l.cautions.length >= 1, `${l.code}: todo ejercicio necesita al menos una precaución`);
    assert.ok(l.steps.length >= 3, `${l.code}: pocos pasos`);
  }
  for (const r of ROUTINES) for (const it of r.items) assert.ok(libCodes.has(it.library_code), `${r.code} usa "${it.library_code}" que no existe`);
});

test("contenido: los ejercicios medidos con cámara existen en el motor de tracking", () => {
  const tracked = db.prepare("SELECT code FROM library_items WHERE tracked_exercise_code IS NOT NULL").all().map((r) => r.code);
  const engine = db.prepare("SELECT code FROM exercises").all().map((r) => r.code);
  assert.deepEqual(tracked.sort(), engine.sort(), "cada ejercicio del motor debe tener su ficha en la biblioteca, y viceversa");
});

// ------------------------------------------------------------------ video

test("video: acepta YouTube y Vimeo por https y rechaza todo lo demás", () => {
  assert.equal(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=10"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(toEmbedUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(toEmbedUrl("https://vimeo.com/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(toEmbedUrl("https://player.vimeo.com/video/123456789"), "https://player.vimeo.com/video/123456789");
  for (const bad of [
    "http://youtu.be/dQw4w9WgXcQ", // sin https
    "https://evil.com/watch?v=dQw4w9WgXcQ", // otro dominio
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", // dominio que solo empieza igual
    "https://www.youtube.com/watch?v=corto", // ID inválido
    "javascript:alert(1)",
    "https://vimeo.com/abc",
    "no es una url",
    "",
    null,
    42,
  ]) assert.equal(toEmbedUrl(bad), null, `debería rechazar ${bad}`);
});

// ------------------------------------------------------------------ biblioteca y rutinas (API)

test("biblioteca: listar con filtros, detalle con evidencia y validación de filtros", async () => {
  const all = await call("GET", "/library");
  assert.equal(all.status, 200);
  assert.equal(all.body.length, LIBRARY.length);
  assert.ok(Array.isArray(all.body[0].steps));

  const rodilla = await call("GET", "/library?area=rodilla");
  assert.ok(rodilla.body.length > 0 && rodilla.body.every((i) => i.body_area === "rodilla"));
  const edu = await call("GET", "/library?category=educacion");
  assert.ok(edu.body.every((i) => i.category === "educacion"));
  const busqueda = await call("GET", "/library?q=elevaci%C3%B3n");
  assert.ok(busqueda.body.map((i) => i.code).includes("straight_leg_raise"));

  assert.equal((await call("GET", "/library?area=cabeza")).status, 400);
  assert.equal((await call("GET", "/library?phase=nunca")).status, 400);

  const detalle = await call("GET", "/library/knee_flexion");
  assert.equal(detalle.status, 200);
  assert.equal(detalle.body.tracked_exercise_code, "knee_flexion");
  assert.ok(detalle.body.evidence.length >= 1 && detalle.body.evidence[0].url.startsWith("https://"));
  assert.equal((await call("GET", "/library/no_existe")).status, 404);
});

test("biblioteca: la clínica asocia un video, se valida y se puede quitar", async () => {
  const ok = await call("PATCH", "/library/elbow_flexion", { video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.video_embed_url, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal((await call("PATCH", "/library/elbow_flexion", { video_url: "https://evil.com/x" })).status, 400);
  assert.equal((await call("PATCH", "/library/elbow_flexion", { video_url: 5 })).status, 400);
  assert.equal((await call("PATCH", "/library/no_existe", { video_url: null })).status, 404);
  const quitado = await call("PATCH", "/library/elbow_flexion", { video_url: null });
  assert.equal(quitado.body.video_url, null);
  assert.equal(quitado.body.video_embed_url, null);
});

test("rutinas: lista, detalle ordenado y evidencia", async () => {
  const list = await call("GET", "/routines?area=rodilla");
  assert.deepEqual(list.body.map((r) => r.code), ["rodilla_movilidad_temprana"]);
  assert.equal(list.body[0].item_count, 2);
  const r = await call("GET", "/routines/rodilla_movilidad_temprana");
  assert.deepEqual(r.body.items.map((i) => i.position), [1, 2]);
  assert.equal(r.body.items[0].code, "knee_flexion");
  assert.equal(r.body.items[0].tracked_exercise_code, "knee_flexion");
  assert.equal(r.body.items[1].tracked_exercise_code, "straight_leg_raise");
  assert.equal((await call("GET", "/routines/no_existe")).status, 404);

  const ev = await call("GET", "/evidence");
  assert.equal(ev.body.length, EVIDENCE.length);
});

// ------------------------------------------------------------------ asignación, recomendación, notas

let t, p;
test("asignar rutinas: crear, duplicado 409, quitar y validaciones", async () => {
  t = await user({ role: "therapist", name: "Dra. Contenido", email: "cont@x.co" });
  p = await user({ role: "patient", name: "Pablo", email: "pablo@x.co", therapist_id: t.id, injury_date: "2026-08-01" });

  assert.equal((await call("POST", `/patients/${p.id}/routines`, { routine_code: "rodilla_movilidad_temprana", assigned_by: p.id })).status, 400, "quien asigna debe ser fisioterapeuta");
  const a = await call("POST", `/patients/${p.id}/routines`, { routine_code: "rodilla_movilidad_temprana", assigned_by: t.id });
  assert.equal(a.status, 201);
  assert.equal(a.body[0].code, "rodilla_movilidad_temprana");
  assert.equal(a.body[0].assigned_by_name, "Dra. Contenido");
  assert.equal((await call("POST", `/patients/${p.id}/routines`, { routine_code: "rodilla_movilidad_temprana" })).status, 409);
  assert.equal((await call("POST", `/patients/${p.id}/routines`, { routine_code: "inexistente" })).status, 400);
  assert.equal((await call("POST", `/patients/${p.id}/routines`, { routine_code: "hombro_primeras_semanas" })).status, 400, "una rutina archivada ya no se puede asignar");

  const del = await call("DELETE", `/patients/${p.id}/routines/${a.body[0].assignment_id}`);
  assert.equal(del.status, 200);
  assert.deepEqual(del.body, []);
  assert.equal((await call("DELETE", `/patients/${p.id}/routines/${a.body[0].assignment_id}`)).status, 404, "quitar dos veces");
  // se puede volver a asignar después de quitarla
  assert.equal((await call("POST", `/patients/${p.id}/routines`, { routine_code: "rodilla_movilidad_temprana" })).status, 201);
  await call("DELETE", `/patients/${p.id}/routines/${(await call("GET", `/patients/${p.id}/overview`)).body.routines.assigned[0].assignment_id}`);
});

test("recomendación: por articulación del plan, sin adelantar la fase y sin repetir las asignadas", async () => {
  const q = await user({ role: "patient", name: "Quique", email: "quique@x.co", therapist_id: t.id });
  await call("POST", `/patients/${q.id}/plans`, { exercise_code: "knee_flexion", side: "right" });

  let rec = (await call("GET", `/patients/${q.id}/overview`)).body.routines.recommended;
  assert.deepEqual(rec.map((r) => r.code), ["rodilla_movilidad_temprana"], "sin fase definida se recomiendan las de su articulación");

  await call("PATCH", `/patients/${q.id}`, { recovery_phase: "proteccion" });
  rec = (await call("GET", `/patients/${q.id}/overview`)).body.routines.recommended;
  assert.deepEqual(rec, [], "en fase de protección no se recomienda una rutina de movilidad (más exigente)");

  await call("PATCH", `/patients/${q.id}`, { recovery_phase: "movilidad" });
  rec = (await call("GET", `/patients/${q.id}/overview`)).body.routines.recommended;
  assert.equal(rec.length, 1);

  await call("POST", `/patients/${q.id}/routines`, { routine_code: "rodilla_movilidad_temprana" });
  const ov = (await call("GET", `/patients/${q.id}/overview`)).body;
  assert.deepEqual(ov.routines.recommended, []);
  assert.equal(ov.routines.assigned.length, 1);
  assert.equal(ov.plans[0].library_code, "knee_flexion", "el plan enlaza a su ficha de la biblioteca");

  // La fase inmediatamente anterior sí se ofrece (movilidad cuando ya está en fortalecimiento); una etapa ya superada, no.
  const h = await user({ role: "patient", name: "Hilda", email: "hilda@x.co", therapist_id: t.id });
  await call("POST", `/patients/${h.id}/plans`, { exercise_code: "knee_flexion", side: "left" });
  await call("PATCH", `/patients/${h.id}`, { recovery_phase: "fortalecimiento" });
  assert.deepEqual((await call("GET", `/patients/${h.id}/overview`)).body.routines.recommended.map((r) => r.code), ["rodilla_movilidad_temprana"], "la fase inmediatamente anterior sí");
  await call("PATCH", `/patients/${h.id}`, { recovery_phase: "funcional" });
  assert.deepEqual((await call("GET", `/patients/${h.id}/overview`)).body.routines.recommended, [], "una etapa ya superada no se ofrece");

  // Un hombro (sin rutinas archivadas) no recibe sugerencias hasta que existan rutinas de su articulación.
  const s = await user({ role: "patient", name: "Sara", email: "sara@x.co", therapist_id: t.id });
  await call("POST", `/patients/${s.id}/plans`, { exercise_code: "shoulder_flexion", side: "left" });
  assert.deepEqual((await call("GET", `/patients/${s.id}/overview`)).body.routines.recommended, []);

  const noPlan = await user({ role: "patient", name: "SinPlan", email: "sp@x.co" });
  assert.deepEqual((await call("GET", `/patients/${noPlan.id}/overview`)).body.routines.recommended, []);
});

test("fase de recuperación: valores válidos, null para limpiar, error para otros", async () => {
  assert.equal((await call("PATCH", `/patients/${p.id}`, { recovery_phase: "fortalecimiento" })).body.recovery_phase, "fortalecimiento");
  assert.equal((await call("PATCH", `/patients/${p.id}`, { recovery_phase: null })).body.recovery_phase, null);
  assert.equal((await call("PATCH", `/patients/${p.id}`, { recovery_phase: "olimpico" })).status, 400);
});

test("el resumen del fisioterapeuta incluye la etapa de cada paciente", async () => {
  await call("PATCH", `/patients/${p.id}`, { recovery_phase: "movilidad" });
  const sum = (await call("GET", `/therapists/${t.id}/summary`)).body;
  assert.equal(sum.patients.find((r) => r.id === p.id).recovery_phase, "movilidad");
});

test("notas clínicas: solo fisioterapeutas, límite de longitud y orden por fecha", async () => {
  assert.equal((await call("POST", `/patients/${p.id}/notes`, { author_id: p.id, body: "hola" })).status, 400, "un paciente no puede escribir notas clínicas");
  assert.equal((await call("POST", `/patients/${p.id}/notes`, { author_id: t.id, body: "   " })).status, 400);
  assert.equal((await call("POST", `/patients/${p.id}/notes`, { author_id: t.id, body: "x".repeat(2001) })).status, 400);
  await call("POST", `/patients/${p.id}/notes`, { author_id: t.id, body: "  Primera nota  " });
  const r = await call("POST", `/patients/${p.id}/notes`, { author_id: t.id, body: "Segunda nota" });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.map((n) => n.body), ["Segunda nota", "Primera nota"], "la más reciente primero; el texto se recorta");
  assert.equal(r.body[0].author_name, "Dra. Contenido");
});

// ------------------------------------------------------------------ sesiones con flexión e informe

test("sesiones: el listado y el detalle traen la flexión (0 en reposo), no solo el ángulo crudo", async () => {
  const r = await user({ role: "patient", name: "Rita", email: "rita@x.co", therapist_id: t.id });
  const s = await call("POST", `/patients/${r.id}/sessions`, {
    exercise_code: "knee_flexion", side: "right", target_angle: 90, started_at: "2026-09-19T15:00:00Z",
    reps: [{ rom_achieved: 120, compensation_flags: ["Inclinación de tronco"] }, { rom_achieved: 100 }],
  });
  assert.equal(s.body.flexion, 80);
  assert.deepEqual(s.body.reps.map((x) => x.flexion), [60, 80]);
  const list = await call("GET", `/patients/${r.id}/sessions`);
  assert.equal(list.body[0].flexion, 80);
  const sh = await user({ role: "patient", name: "Hugo", email: "hugo@x.co" });
  const s2 = await call("POST", `/patients/${sh.id}/sessions`, {
    exercise_code: "shoulder_flexion", side: "left", target_angle: 150, started_at: "2026-09-19T15:00:00Z", reps: [{ rom_achieved: 110 }],
  });
  assert.equal(s2.body.flexion, 110, "en hombro la flexión es el ángulo");
});

test("informe: línea base, mejor, cambio, adherencia de 8 semanas, notas y rutinas", async () => {
  const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
  const r = await user({ role: "patient", name: "Ines", email: "ines@x.co", therapist_id: t.id, injury_date: "2026-07-01" });
  await call("POST", `/patients/${r.id}/plans`, { exercise_code: "knee_flexion", side: "right", times_per_week: 2 });
  const knee = (at, angles) => ({ exercise_code: "knee_flexion", side: "right", target_angle: 90, started_at: at, reps: angles.map((a) => ({ rom_achieved: a })) });
  await call("POST", `/patients/${r.id}/sessions`, knee(daysAgo(30), [140])); // flexión 40 (línea base)
  await call("POST", `/patients/${r.id}/sessions`, knee(daysAgo(20), [120])); // 60
  await call("POST", `/patients/${r.id}/sessions`, knee(daysAgo(2), [125])); // 55 (retrocedió un poco)
  await call("POST", `/patients/${r.id}/sessions`, knee(daysAgo(1), [110])); // 70 (última)
  await call("POST", `/patients/${r.id}/notes`, { author_id: t.id, body: "Buena evolución" });
  await call("POST", `/patients/${r.id}/routines`, { routine_code: "rodilla_movilidad_temprana", assigned_by: t.id });

  const { status, body } = await call("GET", `/patients/${r.id}/report`);
  assert.equal(status, 200);
  assert.equal(body.generated_at, NOW.toISOString());
  const plan = body.plans[0];
  assert.equal(plan.baseline_flexion, 40);
  assert.equal(plan.latest_flexion, 70);
  assert.equal(plan.best_flexion, 70);
  assert.equal(plan.change_flexion, 30);
  assert.equal(plan.sessions, 4);
  assert.equal(body.summary.sessions, 4);
  assert.equal(body.weekly.length, 8);
  assert.equal(body.weekly.every((w) => w.planned === 2), true);
  // 4 sesiones repartidas en 8 semanas con 2 por semana prescritas: 4 de 16
  assert.equal(body.summary.adherence_8w_pct, 25);
  assert.equal(body.notes[0].body, "Buena evolución");
  assert.equal(body.routines[0].code, "rodilla_movilidad_temprana");
  assert.equal(body.patient.days_since_injury, 81);
  assert.equal((await call("GET", "/patients/9999/report")).status, 404);
});

// ------------------------------------------------------------------ contenido archivado y ejercicios como datos

test("el contenido archivado (pending.js) es válido, no se carga en la base y no choca con el activo", async () => {
  const { PENDING_LIBRARY, PENDING_ROUTINES } = await import("../src/content/pending.js");
  assert.deepEqual(PENDING_LIBRARY.map((i) => i.code).sort(), ["ankle_pumps", "forearm_rotation", "grip_squeeze", "pendulum", "quad_sets", "scapular_squeeze", "wrist_flex_ext"]);
  const active = new Set(LIBRARY.map((l) => l.code));
  const evCodes = new Set(EVIDENCE.map((e) => e.code));
  for (const item of PENDING_LIBRARY) {
    assert.ok(!active.has(item.code), `${item.code} está activo y archivado a la vez`);
    assert.ok(Array.isArray(item.steps) && item.steps.length > 0 && Array.isArray(item.cautions), item.code);
    for (const ev of item.evidence) assert.ok(evCodes.has(ev), `${item.code}: evidencia inexistente ${ev}`);
    assert.equal(db.prepare("SELECT 1 FROM library_items WHERE code = ?").get(item.code), undefined, `${item.code} no debe estar en la base`);
  }
  for (const r of PENDING_ROUTINES) assert.equal(db.prepare("SELECT 1 FROM routines WHERE code = ?").get(r.code), undefined, r.code);
});

test("una base que ya tenía los ejercicios y rutinas archivados los pierde al arrancar, con sus asignaciones y sin errores", () => {
  const dir = mkdtempSync(join(tmpdir(), "telerehab-"));
  const file = join(dir, "con-archivados.db");
  try {
    const a = openDb(file);
    // Se simula la base de ANTES: ejercicios, una rutina que los usa, su evidencia y una asignación a un paciente.
    a.prepare("INSERT INTO library_items (code, title, body_area, category, phase, difficulty, duration_min, summary, steps, cautions, sort) VALUES ('quad_sets', 'Cuádriceps', 'rodilla', 'fortalecimiento', 'proteccion', 1, 5, 's', '[]', '[]', 99)").run();
    a.prepare("INSERT INTO library_evidence (library_code, evidence_code) VALUES ('quad_sets', ?)").run(EVIDENCE[0].code);
    a.prepare("INSERT INTO routines (code, title, summary, body_area, phase, duration_min) VALUES ('muneca_mano', 'Muñeca', 's', 'muneca', 'movilidad', 12)").run();
    const rid = a.prepare("SELECT id FROM routines WHERE code = 'muneca_mano'").get().id;
    a.prepare("INSERT INTO routine_items (routine_id, position, library_code, sets, reps) VALUES (?, 1, 'quad_sets', 3, 10)").run(rid);
    a.prepare("INSERT INTO users (role, name, email) VALUES ('patient', 'Paciente', 'p@x.co')").run();
    const uid = a.prepare("SELECT id FROM users WHERE email = 'p@x.co'").get().id;
    a.prepare("INSERT INTO patient_routines (patient_id, routine_id) VALUES (?, ?)").run(uid, rid);
    a.close();

    const b = openDb(file); // arranque: la carga de contenido retira lo que ya no está en el código
    assert.equal(b.prepare("SELECT COUNT(*) n FROM library_items WHERE code = 'quad_sets'").get().n, 0);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM routines WHERE code = 'muneca_mano'").get().n, 0);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM routine_items WHERE library_code = 'quad_sets'").get().n, 0);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM library_evidence WHERE library_code = 'quad_sets'").get().n, 0);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM patient_routines WHERE patient_id = ?").get(uid).n, 0);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM users WHERE email = 'p@x.co'").get().n, 1, "el paciente NO se toca");
    assert.equal(b.prepare("SELECT COUNT(*) n FROM library_items").get().n, LIBRARY.length);
    assert.equal(b.prepare("SELECT COUNT(*) n FROM routines").get().n, ROUTINES.length);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("el catálogo de ejercicios se actualiza desde las especificaciones sin perder planes ni sesiones existentes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "telerehab-"));
  const file = join(dir, "catalogo.db");
  try {
    const a = openDb(file);
    // Una base antigua: la fila del ejercicio existe, sin especificación y con un nombre viejo.
    a.prepare("UPDATE exercises SET spec = NULL, name = 'nombre viejo' WHERE code = 'knee_flexion'").run();
    const id = a.prepare("SELECT id FROM exercises WHERE code = 'knee_flexion'").get().id;
    a.close();
    const b = openDb(file);
    const row = b.prepare("SELECT * FROM exercises WHERE code = 'knee_flexion'").get();
    assert.equal(row.id, id, "el id no cambia (los planes lo referencian)");
    assert.equal(row.name, "Flexión de rodilla");
    assert.equal(JSON.parse(row.spec).measure.type, "joint_angle");
    assert.equal(b.prepare("SELECT COUNT(*) n FROM exercises").get().n, 4);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("un paciente con elevación de pierna: el plan usa la especificación (meta 45°, sentido creciente) y el panel recibe cómo se mide", async () => {
  const th = await user({ role: "therapist", name: "Dr. Pierna", email: "pierna@x.co" });
  const pt = await user({ role: "patient", name: "Pedro Pierna", email: "pedro.pierna@x.co", therapist_id: th.id, injury_date: "2026-08-20" });
  const plan = await call("POST", `/patients/${pt.id}/plans`, { exercise_code: "straight_leg_raise", side: "right", created_by: th.id });
  assert.equal(plan.status, 201);
  assert.equal(plan.body.target_angle, 45);
  const ov = (await call("GET", `/patients/${pt.id}/overview`)).body;
  const p0 = ov.plans[0];
  assert.equal(p0.exercise_code, "straight_leg_raise");
  assert.equal(p0.library_code, "straight_leg_raise", "enlaza a su ficha de la biblioteca");
  assert.equal(p0.spec.measure.reference, "horizontal");
  assert.equal(p0.rest_flexion, 0);
  assert.equal(p0.target_flexion, 45);
  const rec = await call("POST", `/patients/${pt.id}/sessions`, {
    exercise_code: "straight_leg_raise", side: "right", target_angle: 45, plan_id: plan.body.id,
    started_at: "2026-10-05T15:00:00.000Z", reps: [{ rom_achieved: 30, compensation_flags: [] }, { rom_achieved: 38, compensation_flags: [] }],
  });
  assert.equal(rec.status, 201);
  assert.equal(rec.body.best_rom, 38, "ejercicio creciente: la mejor es el máximo");
  assert.equal(rec.body.flexion, 38, "en un ejercicio de segmento, flexión = ángulo");
});
