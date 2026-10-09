// Datos de DEMOSTRACIÓN (ficticios) para ver los dashboards con contenido.
// Pasa por la API real, así el servidor valida y calcula los agregados igual que con datos verdaderos.
//
//   npm run seed            crea los datos (falla si la base ya tiene usuarios)
//   npm run seed -- --reset borra la base de desarrollo y la vuelve a crear
//
// Es determinista: el mismo generador pseudoaleatorio siempre produce los mismos pacientes y ROM.
// Las fechas son relativas a "hoy", así el dashboard siempre se ve reciente.

import { rmSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const dbFile = process.env.DB_FILE ?? fileURLToPath(new URL("../data/telerehab.db", import.meta.url));
if (process.argv.includes("--reset") && existsSync(dbFile)) rmSync(dbFile);

const db = openDb(dbFile);
if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0) {
  console.error("La base ya tiene usuarios. Usa `npm run seed -- --reset` para recrearla desde cero.");
  process.exit(1);
}

const server = createApp(db).listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://localhost:${server.address().port}`;

async function api(method, path, body) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error}`);
  return json;
}

async function putPhoto(patientId, file) {
  const bytes = readFileSync(new URL(`./content/demo-avatars/${file}`, import.meta.url));
  const res = await fetch(`${base}/patients/${patientId}/photo`, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: bytes });
  if (!res.ok) throw new Error(`PUT foto → ${res.status}`);
}

// mulberry32: generador pseudoaleatorio pequeño y determinista.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const now = new Date();

const FLAGS = {
  knee_flexion: ["Inclinación de tronco", "Elevación de cadera"],
  elbow_flexion: ["Inclinación de tronco", "Elevación de hombro"],
  shoulder_flexion: ["Inclinación de tronco", "Elevación de hombro"],
};
const DIRECTION = { knee_flexion: "decreasing", elbow_flexion: "decreasing", shoulder_flexion: "increasing" };

// startFlex/endFlex: grados de flexión al iniciar la rehabilitación y hoy (la trayectoria es una curva que se aplana).
const PATIENTS = [
  { name: "Andrés Mejía", email: "andres.mejia@ejemplo.co", site: "Tibia derecha", injuryDaysAgo: 77, code: "knee_flexion", side: "right", target: 90, perWeek: 4, adherence: 0.9, startFlex: 30, endFlex: 84, comp: 0.08, lastSession: 0 , phase: "movilidad", routine: "rodilla_movilidad_temprana", note: "Buen avance de la flexión de rodilla en las últimas semanas. Se mantiene el plan. Próxima revisión en 2 semanas." },
  { name: "Sofía Herrera", email: "sofia.herrera@ejemplo.co", site: "Húmero proximal izquierdo", injuryDaysAgo: 63, code: "shoulder_flexion", side: "left", target: 150, perWeek: 4, adherence: 0.75, startFlex: 60, endFlex: 112, comp: 0.2, lastSession: 1 , phase: "movilidad", note: "Refiere molestia leve al elevar el brazo por encima de 90°. Vigilar la elevación del hombro como compensación." },
  { name: "Julián Torres", email: "julian.torres@ejemplo.co", site: "Olécranon derecho", injuryDaysAgo: 56, code: "elbow_flexion", side: "right", target: 60, perWeek: 3, adherence: 0.85, startFlex: 45, endFlex: 100, comp: 0.1, lastSession: 0 , phase: "movilidad", note: "Adherencia irregular esta semana; explicar la importancia de la constancia. Movilidad de codo en buen camino." },
  { name: "Valentina Cruz", email: "valentina.cruz@ejemplo.co", site: "Rótula izquierda", injuryDaysAgo: 49, code: "knee_flexion", side: "left", target: 90, perWeek: 4, adherence: 0.6, startFlex: 25, endFlex: 55, comp: 0.12, lastSession: 8 , phase: "movilidad", routine: null, note: "No ha retomado los ejercicios en la última semana. Llamar para explorar barreras (dolor, tiempo, dudas con la aplicación)." },
  { name: "Daniel Ospina", email: "daniel.ospina@ejemplo.co", site: "Fémur distal derecho", injuryDaysAgo: 70, code: "knee_flexion", side: "right", target: 90, perWeek: 3, adherence: 0.8, startFlex: 35, endFlex: 70, comp: 0.45, lastSession: 1 , phase: "movilidad", routine: null, note: "Compensa con el tronco y la cadera al final de la flexión. Reforzar la técnica y valorar una cita presencial de control." },
  { name: "Marta Lozano", email: "marta.lozano@ejemplo.co", site: "Clavícula derecha", injuryDaysAgo: 84, code: "shoulder_flexion", side: "right", target: 150, perWeek: 3, adherence: 0.9, startFlex: 70, endFlex: 152, comp: 0.05, lastSession: 0 , phase: "fortalecimiento", routine: null, note: "Alcanzó la meta de flexión de hombro. Evaluar el alta o el paso a fortalecimiento." },
];

const EXTRA = {"Andrés Mejía": {"doc": "1000000101", "birth": "1988-03-14", "phone": "310 000 0101", "city": "Medellín", "dx": "S82.2", "dom": "right", "job": "Conductor", "ec": ["Marcela Mejía", "310 000 0201"], "consent": true, "avatar": "avatar-1.jpg"}, "Sofía Herrera": {"doc": "1000000102", "birth": "1975-11-02", "phone": "311 000 0102", "city": "Bogotá", "dx": "S42.2", "dom": "right", "job": "Docente", "ec": ["Camilo Herrera", "311 000 0202"], "consent": true, "avatar": "avatar-2.jpg"}, "Julián Torres": {"doc": "1000000103", "birth": "1996-07-25", "phone": "312 000 0103", "city": "Cali", "dx": "S52.0", "dom": "right", "job": "Estudiante", "ec": ["Rosa Torres", "312 000 0203"], "consent": true, "avatar": null}, "Valentina Cruz": {"doc": "1000000104", "birth": "1992-01-30", "phone": "313 000 0104", "city": "Barranquilla", "dx": "S82.0", "dom": "left", "job": "Diseñadora", "ec": ["Luis Cruz", "313 000 0204"], "consent": false, "avatar": null}, "Daniel Ospina": {"doc": "1000000105", "birth": "1969-09-09", "phone": "314 000 0105", "city": "Bucaramanga", "dx": "S72.4", "dom": "right", "job": "Comerciante", "ec": ["Elena Ospina", "314 000 0205"], "consent": true, "avatar": null}, "Marta Lozano": {"doc": "1000000106", "birth": "1958-12-18", "phone": "315 000 0106", "city": "Cartagena", "dx": "S42.0", "dom": "right", "job": "Pensionada", "ec": ["Jorge Lozano", "315 000 0206"], "consent": true, "avatar": "avatar-3.jpg"}};

const isoDate = (daysAgo) => new Date(now.getTime() - daysAgo * DAY).toISOString().slice(0, 10);

const therapist = await api("POST", "/users", { role: "therapist", name: "Dra. Camila Restrepo", email: "camila.restrepo@ejemplo.co" });
let sessionsCreated = 0;

for (const [i, p] of PATIENTS.entries()) {
  const rand = rng(1000 + i);
  const x = EXTRA[p.name];
  const patient = await api("POST", "/users", {
    role: "patient", name: p.name, email: p.email, therapist_id: therapist.id,
    fracture_site: p.site, injury_date: isoDate(p.injuryDaysAgo),
    document_type: "CC", document_number: x.doc, birth_date: x.birth, phone: x.phone, city: x.city, eps: "EPS Demostración",
    emergency_contact_name: x.ec[0], emergency_contact_phone: x.ec[1], diagnosis_code: x.dx, dominant_side: x.dom, occupation: x.job,
  });
  if (x.consent) await api("PUT", `/patients/${patient.id}/consent`, { granted: true, recorded_by: therapist.id });
  if (x.avatar) await putPhoto(patient.id, x.avatar);
  await api("PATCH", `/patients/${patient.id}`, { recovery_phase: p.phase });
  if (p.routine) await api("POST", `/patients/${patient.id}/routines`, { routine_code: p.routine, assigned_by: therapist.id });
  await api("POST", `/patients/${patient.id}/notes`, { author_id: therapist.id, body: p.note });
  await api("POST", `/patients/${patient.id}/plans`, {
    exercise_code: p.code, side: p.side, target_angle: p.target, times_per_week: p.perWeek,
    sets: 3, reps_per_set: 10, created_by: therapist.id,
  });

  const rehabDays = 56; // la rehabilitación con cámara empezó hace 8 semanas
  const dir = DIRECTION[p.code];
  for (let daysAgo = rehabDays; daysAgo >= p.lastSession; daysAgo--) {
    // Probabilidad de entrenar ese día = sesiones por semana × adherencia / 7.
    const forced = daysAgo === p.lastSession; // garantiza la última sesión configurada
    if (!forced && rand() > (p.perWeek * p.adherence) / 7) continue;

    const f = (rehabDays - daysAgo) / rehabDays;
    const eased = 1 - (1 - f) ** 2; // mejora rápida al inicio, más lenta después
    const bestFlex = p.startFlex + (p.endFlex - p.startFlex) * eased + (rand() - 0.5) * 6;

    const hour = 13 + Math.floor(rand() * 10); // 13–22 UTC ≈ 8–17 h en Colombia
    let start = new Date(now.getTime() - daysAgo * DAY);
    start.setUTCHours(hour, Math.floor(rand() * 60), 0, 0);
    if (start > now) start = new Date(now.getTime() - 3_600_000);

    const nReps = 8 + Math.floor(rand() * 5);
    const reps = Array.from({ length: nReps }, () => {
      const flex = Math.max(5, bestFlex - rand() * 9); // la mejor repetición ≈ bestFlex
      const flags = rand() < p.comp ? [FLAGS[p.code][rand() < 0.65 ? 0 : 1]] : [];
      return { rom_achieved: Math.round((dir === "decreasing" ? 180 - flex : flex) * 10) / 10, compensation_flags: flags };
    });
    await api("POST", `/patients/${patient.id}/sessions`, {
      exercise_code: p.code, side: p.side, target_angle: p.target,
      started_at: start.toISOString(), ended_at: new Date(start.getTime() + nReps * 7000 + 60_000).toISOString(),
      reps,
    });
    sessionsCreated++;
  }
}

server.close();
console.log(`Datos de demostración creados en ${dbFile}`);
console.log(`  1 fisioterapeuta (id ${therapist.id}), ${PATIENTS.length} pacientes, ${sessionsCreated} sesiones`);
