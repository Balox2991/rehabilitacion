import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { ageOn, documentHint, isCalendarDate, isJpeg, normalizeCie10, normalizeDocument, normalizePhone } from "../src/validators.js";
import { buildProfileUpdate } from "../src/profile.js";

const NOW = new Date("2026-09-20T15:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

// ------------------------------------------------------------------ validadores (puros)

test("documento: quita puntos y espacios, aplica el largo por tipo y rechaza lo raro", () => {
  assert.equal(normalizeDocument("CC", "1.234.567.890"), "1234567890");
  assert.equal(normalizeDocument("CC", " 79 123 456 "), "79123456");
  assert.equal(normalizeDocument("CC", "1234"), null, "muy corto");
  assert.equal(normalizeDocument("CC", "12345678901"), null, "muy largo");
  assert.equal(normalizeDocument("CC", "12AB5678"), null, "letras en una cédula");
  assert.equal(normalizeDocument("TI", "1012345678"), "1012345678");
  assert.equal(normalizeDocument("PA", "ab123456"), "AB123456", "el pasaporte admite letras y se pasa a mayúsculas");
  assert.equal(normalizeDocument("XX", "123456"), null, "tipo desconocido");
  assert.match(documentHint("CC"), /dígitos/);
});

test("celular colombiano: 10 dígitos que empiezan por 3; acepta +57, espacios y guiones", () => {
  assert.equal(normalizePhone("300 123 4567"), "3001234567");
  assert.equal(normalizePhone("+57 (300) 123-4567"), "3001234567");
  assert.equal(normalizePhone("573001234567"), "3001234567");
  assert.equal(normalizePhone("6012345678"), "6012345678", "fijo: 60 + 8 dígitos");
  for (const bad of ["1234567890", "300123456", "30012345678", "abc", "", null, "+1 300 123 4567"]) assert.equal(normalizePhone(bad), null, `debería rechazar ${bad}`);
});

test("CIE-10: letra + 2 dígitos + subcódigo opcional; pasa a mayúsculas", () => {
  assert.equal(normalizeCie10("s82.2"), "S82.2");
  assert.equal(normalizeCie10("S72.41"), "S72.41");
  assert.equal(normalizeCie10("M54"), "M54");
  for (const bad of ["82.2", "S8", "S82.222", "U07.1", "S82,2", "fractura"]) assert.equal(normalizeCie10(bad), null, `debería rechazar ${bad}`);
});

test("edad: años cumplidos, contando bien el día del cumpleaños", () => {
  assert.equal(ageOn("1990-09-20", NOW), 36, "cumple hoy");
  assert.equal(ageOn("1990-09-21", NOW), 35, "cumple mañana");
  assert.equal(ageOn("1990-02-31", NOW), null, "fecha imposible");
  assert.equal(isCalendarDate("2026-02-28"), true);
  assert.equal(isCalendarDate("2026-02-31"), false);
});

test("isJpeg mira la firma del archivo, no lo que diga el cliente", () => {
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
  assert.equal(isJpeg(Buffer.from("<svg onload=alert(1)>")), false);
  assert.equal(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false, "PNG");
  assert.equal(isJpeg(undefined), false);
});

test("buildProfileUpdate: normaliza, valida el par documento y la coherencia de fechas", () => {
  const ok = buildProfileUpdate(
    { document_type: "CC", document_number: "1.020.304.050", phone: "+57 310 555 1234", diagnosis_code: "s82.2", eps: "  Sura   EPS ", city: "" },
    {},
    NOW
  );
  assert.deepEqual(ok.set, { document_type: "CC", document_number: "1020304050", phone: "3105551234", diagnosis_code: "S82.2", eps: "Sura EPS", city: null });

  assert.match(buildProfileUpdate({ document_type: "CC" }, {}, NOW).error, /número de documento/i, "tipo sin número");
  assert.match(buildProfileUpdate({ document_number: "12345678" }, { document_type: null }, NOW).error, /document_type/);
  // El número se valida con el tipo YA guardado si solo llega el número.
  assert.equal(buildProfileUpdate({ document_number: "12345678" }, { document_type: "CC" }, NOW).set.document_number, "12345678");
  assert.match(buildProfileUpdate({ document_number: "ABC" }, { document_type: "CC" }, NOW).error, /inválido para CC/);
  // Borrar el documento: los dos a null.
  assert.deepEqual(buildProfileUpdate({ document_type: "", document_number: "" }, { document_type: "CC", document_number: "1" }, NOW).set, { document_type: null, document_number: null });

  assert.match(buildProfileUpdate({ injury_date: "2027-01-01" }, {}, NOW).error, /futuro/);
  assert.match(buildProfileUpdate({ birth_date: "1850-01-01" }, {}, NOW).error, /plausible/);
  assert.match(buildProfileUpdate({ surgery_date: "2026-06-01" }, { injury_date: "2026-07-01" }, NOW).error, /anterior a la lesión/);
  assert.equal(buildProfileUpdate({ surgery_date: "2026-07-05" }, { injury_date: "2026-07-01" }, NOW).error, undefined);
  assert.match(buildProfileUpdate({ eps: "x".repeat(81) }, {}, NOW).error, /máximo 80/);
  assert.match(buildProfileUpdate({ dominant_side: "arriba" }, {}, NOW).error, /dominant_side/);
});

test("buildProfileUpdate ignora campos que no son de la ficha (no se puede colar una columna arbitraria)", () => {
  const r = buildProfileUpdate({ name: "Hacker", "notes; DROP TABLE users": "x", role: "therapist", city: "Cali" }, {}, NOW);
  assert.deepEqual(r.set, { city: "Cali" });
});

// ------------------------------------------------------------------ API

let server, base;
before(async () => {
  server = createApp(openDb(":memory:"), { now: () => NOW }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body, headers = {}) {
  const isRaw = Buffer.isBuffer(body);
  const res = await fetch(base + path, {
    method,
    headers: isRaw ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body),
  });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, body: type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()), type };
}
const user = async (data) => (await call("POST", "/users", data)).body;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

let t, p;

test("crear paciente con ficha colombiana: se normaliza y se calcula la edad", async () => {
  t = await user({ role: "therapist", name: "Dra. Perfil", email: "perfil@x.co" });
  const created = await call("POST", "/users", {
    role: "patient", name: "Laura Gómez", email: "laura@x.co", therapist_id: t.id, fracture_site: "Tibia izquierda",
    injury_date: "2026-08-01", document_type: "CC", document_number: "1.020.304.050", birth_date: "1990-05-10",
    phone: "+57 300 123 4567", city: "Medellín", eps: "Sura", diagnosis_code: "s82.2", dominant_side: "right",
  });
  assert.equal(created.status, 201);
  p = created.body;
  const got = (await call("GET", `/patients/${p.id}`)).body;
  assert.equal(got.document_number, "1020304050");
  assert.equal(got.phone, "3001234567");
  assert.equal(got.diagnosis_code, "S82.2");
  assert.equal(got.age, 36);
  assert.equal(got.has_photo, false);
  assert.equal(got.data_consent_at, null);
});

test("documento repetido → 409, y no se crea el usuario a medias", async () => {
  const dup = await call("POST", "/users", { role: "patient", name: "Otra", email: "otra@x.co", document_type: "CC", document_number: "1020304050" });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /documento/);
  const again = await call("POST", "/users", { role: "patient", name: "Otra", email: "otra@x.co", document_type: "TI", document_number: "1020304050" });
  assert.equal(again.status, 201, "el mismo número con otro TIPO de documento sí es otra persona; y el email quedó libre porque el rollback deshizo el intento anterior");
});

test("PATCH de la ficha: validaciones con mensajes claros y sin efectos parciales", async () => {
  assert.equal((await call("PATCH", `/patients/${p.id}`, { phone: "12345" })).status, 400);
  assert.equal((await call("PATCH", `/patients/${p.id}`, { diagnosis_code: "fractura" })).status, 400);
  assert.equal((await call("PATCH", `/patients/${p.id}`, { name: "solo esto no es de la ficha" })).status, 400);
  const bad = await call("PATCH", `/patients/${p.id}`, { city: "Bogotá", phone: "nope" });
  assert.equal(bad.status, 400);
  assert.equal((await call("GET", `/patients/${p.id}`)).body.city, "Medellín", "no se guardó la ciudad porque el teléfono falló");
  const ok = await call("PATCH", `/patients/${p.id}`, { city: "Bogotá", emergency_contact_name: "Pedro Gómez", emergency_contact_phone: "310 555 0000" });
  assert.equal(ok.body.city, "Bogotá");
  assert.equal(ok.body.emergency_contact_phone, "3105550000");
  assert.equal((await call("PATCH", `/patients/${p.id}`, { city: "" })).body.city, null, "vacío borra el dato");
});

test("consentimiento (Ley 1581): registrar con fecha y responsable, y revocar", async () => {
  assert.equal((await call("PUT", `/patients/${p.id}/consent`, { granted: true })).status, 400, "falta quién lo registra");
  assert.equal((await call("PUT", `/patients/${p.id}/consent`, { granted: "sí", recorded_by: t.id })).status, 400);
  const on = await call("PUT", `/patients/${p.id}/consent`, { granted: true, recorded_by: t.id });
  assert.equal(on.body.data_consent_at, NOW.toISOString());
  assert.equal(on.body.data_consent_by_name, "Dra. Perfil");
  const off = await call("PUT", `/patients/${p.id}/consent`, { granted: false });
  assert.equal(off.body.data_consent_at, null);
  assert.equal(off.body.data_consent_by, null);
});

test("foto: se sube, se sirve como image/jpeg, se ve en las listas y se puede quitar", async () => {
  assert.equal((await call("GET", `/patients/${p.id}/photo`)).status, 404);
  const up = await call("PUT", `/patients/${p.id}/photo`, JPEG, { "content-type": "image/jpeg" });
  assert.equal(up.status, 200);
  assert.equal(up.body.has_photo, true);
  const got = await call("GET", `/patients/${p.id}/photo`);
  assert.equal(got.status, 200);
  assert.equal(got.type, "image/jpeg");
  assert.deepEqual(got.body, JPEG);

  const sum = (await call("GET", `/therapists/${t.id}/summary`)).body.patients.find((r) => r.id === p.id);
  assert.equal(sum.has_photo, true);
  assert.equal(sum.photo_v, NOW.toISOString());
  assert.equal(sum.age, 36);
  assert.equal(sum.phone, "3001234567");

  const del = await call("DELETE", `/patients/${p.id}/photo`);
  assert.equal(del.body.has_photo, false);
  assert.equal((await call("GET", `/patients/${p.id}/photo`)).status, 404);
});

test("foto: rechaza lo que no es un JPEG real, lo que declara otro tipo y lo demasiado grande", async () => {
  const fakeJpeg = Buffer.from("<html><script>alert(1)</script></html>");
  assert.equal((await call("PUT", `/patients/${p.id}/photo`, fakeJpeg, { "content-type": "image/jpeg" })).status, 400, "dice jpeg pero no lo es");
  assert.equal((await call("PUT", `/patients/${p.id}/photo`, JPEG, { "content-type": "image/png" })).status, 400, "tipo no permitido");
  assert.equal((await call("PUT", `/patients/${p.id}/photo`, undefined, { "content-type": "image/jpeg" })).status, 400, "sin contenido");
  const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400 * 1024)]);
  assert.equal((await call("PUT", `/patients/${p.id}/photo`, huge, { "content-type": "image/jpeg" })).status, 413);
  assert.equal((await call("PUT", "/patients/9999/photo", JPEG, { "content-type": "image/jpeg" })).status, 404);
});

// ------------------------------------------------------------------ umbrales configurables

test("ajustes del fisioterapeuta: valores por defecto, validación y persistencia", async () => {
  assert.deepEqual((await call("GET", `/therapists/${t.id}/settings`)).body, { inactivity_days: 5, compensation_alert_pct: 30 });
  for (const bad of [{ inactivity_days: 0, compensation_alert_pct: 30 }, { inactivity_days: 61, compensation_alert_pct: 30 }, { inactivity_days: 5.5, compensation_alert_pct: 30 }, { inactivity_days: 5, compensation_alert_pct: 4 }, { inactivity_days: 5 }, {}]) {
    assert.equal((await call("PUT", `/therapists/${t.id}/settings`, bad)).status, 400, JSON.stringify(bad));
  }
  const saved = await call("PUT", `/therapists/${t.id}/settings`, { inactivity_days: 10, compensation_alert_pct: 50 });
  assert.deepEqual(saved.body, { inactivity_days: 10, compensation_alert_pct: 50 });
  assert.deepEqual((await call("GET", `/therapists/${t.id}/settings`)).body, saved.body);
  assert.equal((await call("GET", `/therapists/${p.id}/settings`)).status, 404, "un paciente no tiene ajustes de fisioterapeuta");
  assert.equal((await call("PUT", `/therapists/${t.id}/settings`, { inactivity_days: 5, compensation_alert_pct: 30 })).status, 200);
});

test("los umbrales cambian los estados: 9 días sin sesión es alerta con 5 días pero no con 10", async () => {
  const t2 = await user({ role: "therapist", name: "Dr. Umbral", email: "umbral@x.co" });
  const q = await user({ role: "patient", name: "Quique", email: "quique2@x.co", therapist_id: t2.id });
  await call("POST", `/patients/${q.id}/plans`, { exercise_code: "knee_flexion", side: "right" });
  const knee = (at, flags) => ({ exercise_code: "knee_flexion", side: "right", target_angle: 90, started_at: at, reps: [{ rom_achieved: 120, compensation_flags: flags }, { rom_achieved: 110, compensation_flags: flags }] });
  await call("POST", `/patients/${q.id}/sessions`, knee(daysAgo(9), []));
  const status = async () => (await call("GET", `/therapists/${t2.id}/summary`)).body.patients[0].status;

  assert.equal(await status(), "sin_actividad");
  await call("PUT", `/therapists/${t2.id}/settings`, { inactivity_days: 10, compensation_alert_pct: 30 });
  assert.equal(await status(), "al_dia", "con 10 días de tolerancia ya no es alerta");

  // Compensaciones: en 30 días hay 4 repeticiones y 2 con alerta = 50 %.
  await call("POST", `/patients/${q.id}/sessions`, knee(daysAgo(1), ["Inclinación de tronco"]));
  assert.equal(await status(), "compensaciones", "50 % ≥ 30 %");
  await call("PUT", `/therapists/${t2.id}/settings`, { inactivity_days: 10, compensation_alert_pct: 60 });
  assert.equal(await status(), "al_dia", "50 % < 60 %");
});

test("la ficha del paciente y el panel muestran EXACTAMENTE el mismo estado (una sola fuente de la lógica)", async () => {
  const sum = (await call("GET", `/therapists/${t.id}/summary`)).body.patients.find((r) => r.id === p.id);
  const ov = (await call("GET", `/patients/${p.id}/overview`)).body;
  assert.deepEqual(ov.summary, sum);
  assert.equal(ov.patient.phone, "3001234567");
  assert.equal(ov.patient.document_number, "1020304050");
});
