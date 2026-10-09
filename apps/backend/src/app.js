import express from "express";
import { transaction } from "./db.js";
import { getSettings, patientOverview, patientReport, saveSettings, therapistSummary } from "./analytics.js";
import { PROFILE_COLUMNS, buildProfileUpdate } from "./profile.js";
import { ageOn, isJpeg } from "./validators.js";
import { AREAS, CATEGORIES, PHASES, assignedRoutines, getLibraryItem, getRoutine, listEvidence, listLibrary, listRoutines } from "./library.js";
import { toEmbedUrl } from "./video.js";
import { ANALYZER_VERSION, analyzeSession } from "./engine.js";
import { parseTrace } from "./trace.js";
import { coachingFor } from "./coaching.js";

const ROLES = ["patient", "therapist"];
const SIDES = ["left", "right"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPosInt = (v) => Number.isInteger(v) && v > 0;

function require_(cond, message) {
  if (!cond) throw new HttpError(400, message);
}

// Todas las marcas de tiempo se guardan en UTC ISO para que ordenar como texto sea ordenar en el tiempo.
function toUtcIso(v) {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Zona horaria del cliente: minutos al este de UTC (Colombia = -300). Opcional; sin ella se usa UTC.
function toTz(raw) {
  if (raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || Math.abs(n) > 840) throw new HttpError(400, "tz debe ser un entero de minutos entre -840 y 840");
  return n;
}

function toId(raw) {
  const id = Number(raw);
  if (!isPosInt(id)) throw new HttpError(400, "id inválido");
  return id;
}

// `now` es inyectable para que las estadísticas (ventanas de 7/30 días, rachas) sean deterministas en las pruebas.
export function createApp(db, { now = () => new Date() } = {}) {
  const app = express();
  // Los registros de sesión (ángulos + esqueleto) pesan cientos de KB: solo esa ruta admite un cuerpo grande. Todas las
  // demás conservan el límite de fábrica de 100 KB, así una petición enorme no se acepta en cualquier lado.
  const json = express.json();
  const bigJson = express.json({ limit: "3mb" });
  app.use((req, res, next) => (req.method === "POST" && /^\/patients\/\d+\/sessions$/.test(req.path) ? bigJson : json)(req, res, next));

  const userById = db.prepare("SELECT * FROM users WHERE id = ?");
  // Los ids que llegan del cliente pueden faltar o no ser números: en ese caso "no existe", no un error 500.
  const findUser = (id) => (Number.isInteger(id) && id > 0 ? userById.get(id) : undefined);
  const q = {
    userById: { get: findUser },
    exerciseByCode: db.prepare("SELECT * FROM exercises WHERE code = ?"),
    planById: db.prepare("SELECT * FROM exercise_plans WHERE id = ?"),
  };

  function getPatient(id) {
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.created_at, p.therapist_id, p.fracture_site, p.injury_date, p.recovery_phase, p.notes,
                p.document_type, p.document_number, p.birth_date, p.phone, p.city, p.eps,
                p.emergency_contact_name, p.emergency_contact_phone, p.diagnosis_code, p.surgery_date,
                p.dominant_side, p.occupation, p.data_consent_at, p.data_consent_by, cb.name AS data_consent_by_name,
                ph.updated_at AS photo_v
           FROM users u
           LEFT JOIN patient_profiles p ON p.user_id = u.id
           LEFT JOIN users cb ON cb.id = p.data_consent_by
           LEFT JOIN patient_photos ph ON ph.patient_id = u.id
          WHERE u.id = ? AND u.role = 'patient'`
      )
      .get(id);
    if (!row) throw new HttpError(404, "paciente no encontrado");
    row.has_photo = Boolean(row.photo_v);
    row.age = row.birth_date ? ageOn(row.birth_date, now()) : null;
    return row;
  }

  function hasActivePlan(patientId, exerciseId, side, exceptPlanId = 0) {
    return !!db
      .prepare("SELECT 1 FROM exercise_plans WHERE patient_id = ? AND exercise_id = ? AND side = ? AND active = 1 AND id <> ?")
      .get(patientId, exerciseId, side, exceptPlanId);
  }

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/exercises", (_req, res) => {
    res.json(db.prepare("SELECT * FROM exercises ORDER BY id").all().map((e) => ({ ...e, spec: e.spec ? JSON.parse(e.spec) : null })));
  });

  // ---- Usuarios ----------------------------------------------------------
  app.post("/users", (req, res) => {
    const { role, name, email, therapist_id } = req.body ?? {};
    require_(ROLES.includes(role), "role debe ser 'patient' o 'therapist'");
    require_(typeof name === "string" && name.trim(), "name es obligatorio");
    require_(typeof email === "string" && /^\S+@\S+\.\S+$/.test(email), "email inválido");

    if (therapist_id != null) {
      require_(role === "patient", "therapist_id solo aplica a pacientes");
      const t = q.userById.get(therapist_id);
      require_(t && t.role === "therapist", "therapist_id no corresponde a un fisioterapeuta");
    }
    let profile = null;
    if (role === "patient") {
      const built = buildProfileUpdate(req.body, {}, now());
      require_(!built.error, built.error);
      profile = built.set;
    }

    const id = transaction(db, () => {
      let userId;
      try {
        userId = Number(
          db.prepare("INSERT INTO users (role, name, email) VALUES (?, ?, ?)").run(role, name.trim(), email.toLowerCase())
            .lastInsertRowid
        );
      } catch (err) {
        if (/UNIQUE/.test(err.message)) throw new HttpError(409, "ya existe un usuario con ese email");
        throw err;
      }
      if (role === "patient") {
        const cols = Object.keys(profile); // nombres de columna salen de una lista fija (profile.js), nunca del cliente
        try {
          db.prepare(`INSERT INTO patient_profiles (user_id${cols.map((c) => `, ${c}`).join("")}) VALUES (?${cols.map(() => ", ?").join("")})`).run(
            userId,
            ...cols.map((c) => profile[c])
          );
        } catch (err) {
          if (/UNIQUE/.test(err.message)) throw new HttpError(409, "ya existe un paciente con ese documento");
          throw err;
        }
      }
      return userId;
    });
    res.status(201).json(q.userById.get(id));
  });

  // Lista pública de fisioterapeutas: solo para el "modo demostración" del frontend (sin login todavía, Fase 5).
  app.get("/therapists", (_req, res) => {
    res.json(db.prepare("SELECT id, name FROM users WHERE role = 'therapist' ORDER BY name").all());
  });

  const therapistOr404 = (rawId) => {
    const id = toId(rawId);
    const t = q.userById.get(id);
    if (!t || t.role !== "therapist") throw new HttpError(404, "fisioterapeuta no encontrado");
    return id;
  };

  app.get("/therapists/:id/settings", (req, res) => res.json(getSettings(db, therapistOr404(req.params.id))));

  app.put("/therapists/:id/settings", (req, res) => {
    const id = therapistOr404(req.params.id);
    const { inactivity_days, compensation_alert_pct } = req.body ?? {};
    require_(Number.isInteger(inactivity_days) && inactivity_days >= 1 && inactivity_days <= 60, "inactivity_days debe ser un entero entre 1 y 60");
    require_(Number.isInteger(compensation_alert_pct) && compensation_alert_pct >= 5 && compensation_alert_pct <= 100, "compensation_alert_pct debe ser un entero entre 5 y 100");
    res.json(saveSettings(db, id, { inactivity_days, compensation_alert_pct }));
  });

  app.get("/therapists/:id/patients", (req, res) => {
    const id = toId(req.params.id);
    const t = q.userById.get(id);
    if (!t || t.role !== "therapist") throw new HttpError(404, "fisioterapeuta no encontrado");
    res.json(
      db
        .prepare(
          `SELECT u.id, u.name, u.email, p.fracture_site, p.injury_date
             FROM patient_profiles p JOIN users u ON u.id = p.user_id
            WHERE p.therapist_id = ? ORDER BY u.name`
        )
        .all(id)
    );
  });

  app.get("/patients/:id", (req, res) => res.json(getPatient(toId(req.params.id))));

  app.patch("/patients/:id", (req, res) => {
    const id = toId(req.params.id);
    const current = getPatient(id);
    const body = req.body ?? {};
    require_(PROFILE_COLUMNS.some((f) => f in body), `enviar al menos uno de: ${PROFILE_COLUMNS.join(", ")}`);
    if (body.therapist_id != null) {
      const t = q.userById.get(body.therapist_id);
      require_(t && t.role === "therapist", "therapist_id no corresponde a un fisioterapeuta");
    }
    const built = buildProfileUpdate(body, current, now());
    require_(!built.error, built.error);
    const cols = Object.keys(built.set);
    try {
      db.prepare(`UPDATE patient_profiles SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE user_id = ?`).run(...cols.map((c) => built.set[c]), id);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, "ya existe un paciente con ese documento");
      throw err;
    }
    res.json(getPatient(id));
  });

  // Autorización de tratamiento de datos personales (Ley 1581 de 2012): la registra el fisioterapeuta al recibirla
  // firmada; también se puede revocar. Se guarda cuándo y quién la registró.
  app.put("/patients/:id/consent", (req, res) => {
    const id = toId(req.params.id);
    getPatient(id);
    const { granted, recorded_by } = req.body ?? {};
    require_(typeof granted === "boolean", "granted debe ser true o false");
    if (granted) {
      const t = q.userById.get(recorded_by);
      require_(t && t.role === "therapist", "recorded_by debe ser un fisioterapeuta");
    }
    db.prepare("UPDATE patient_profiles SET data_consent_at = ?, data_consent_by = ? WHERE user_id = ?").run(
      granted ? now().toISOString() : null,
      granted ? recorded_by : null,
      id
    );
    res.json(getPatient(id));
  });

  // Foto del paciente: solo JPEG, máximo 300 KB (el navegador la reduce antes de enviarla). Se valida el
  // contenido real del archivo (firma FF D8 FF), no solo el Content-Type que declara el cliente.
  app.put("/patients/:id/photo", express.raw({ type: "image/jpeg", limit: "300kb" }), (req, res) => {
    const id = toId(req.params.id);
    getPatient(id);
    require_(Buffer.isBuffer(req.body) && isJpeg(req.body), "Envía la foto como image/jpeg");
    const at = now().toISOString();
    db.prepare(
      `INSERT INTO patient_photos (patient_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(patient_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(id, req.body, at);
    res.json({ has_photo: true, photo_v: at });
  });

  app.get("/patients/:id/photo", (req, res) => {
    const row = db.prepare("SELECT data FROM patient_photos WHERE patient_id = ?").get(toId(req.params.id));
    if (!row) throw new HttpError(404, "el paciente no tiene foto");
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" });
    res.send(Buffer.from(row.data));
  });

  app.delete("/patients/:id/photo", (req, res) => {
    const id = toId(req.params.id);
    getPatient(id);
    db.prepare("DELETE FROM patient_photos WHERE patient_id = ?").run(id);
    res.json({ has_photo: false, photo_v: null });
  });

  // ---- Planes de ejercicio ----------------------------------------------
  app.post("/patients/:id/plans", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const { exercise_code, side, target_angle, sets, reps_per_set, times_per_week, created_by } = req.body ?? {};
    const exercise = q.exerciseByCode.get(exercise_code);
    require_(exercise, "exercise_code desconocido (ver GET /exercises)");
    require_(SIDES.includes(side), "side debe ser 'left' o 'right'");
    const target = target_angle ?? exercise.default_target_angle;
    require_(isNum(target) && target > 0 && target <= 180, "target_angle debe estar entre 0 y 180");
    for (const [k, v] of Object.entries({ sets, reps_per_set, times_per_week })) {
      require_(v === undefined || isPosInt(v), `${k} debe ser un entero positivo`);
    }
    if (created_by != null) {
      const t = q.userById.get(created_by);
      require_(t && t.role === "therapist", "created_by no corresponde a un fisioterapeuta");
    }
    if (hasActivePlan(patientId, exercise.id, side)) {
      throw new HttpError(409, "el paciente ya tiene un plan activo para ese ejercicio y lado; ajústalo o desactívalo primero");
    }
    const info = db
      .prepare(
        `INSERT INTO exercise_plans (patient_id, exercise_id, created_by, side, target_angle, sets, reps_per_set, times_per_week)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 3), COALESCE(?, 10), COALESCE(?, 3))`
      )
      .run(patientId, exercise.id, created_by ?? null, side, target, sets ?? null, reps_per_set ?? null, times_per_week ?? null);
    res.status(201).json(q.planById.get(Number(info.lastInsertRowid)));
  });

  app.get("/patients/:id/plans", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const onlyActive = req.query.active === "1";
    res.json(
      db
        .prepare(
          `SELECT pl.*, e.code AS exercise_code, e.name AS exercise_name
             FROM exercise_plans pl JOIN exercises e ON e.id = pl.exercise_id
            WHERE pl.patient_id = ? ${onlyActive ? "AND pl.active = 1" : ""}
            ORDER BY pl.id`
        )
        .all(patientId)
    );
  });

  app.patch("/plans/:id", (req, res) => {
    const id = toId(req.params.id);
    const plan = q.planById.get(id);
    if (!plan) throw new HttpError(404, "plan no encontrado");
    const body = req.body ?? {};
    const allowed = ["target_angle", "sets", "reps_per_set", "times_per_week", "active"];
    const fields = allowed.filter((f) => f in body);
    require_(fields.length > 0, `enviar al menos uno de: ${allowed.join(", ")}`);
    if ("target_angle" in body) require_(isNum(body.target_angle) && body.target_angle > 0 && body.target_angle <= 180, "target_angle debe estar entre 0 y 180");
    for (const f of ["sets", "reps_per_set", "times_per_week"]) if (f in body) require_(isPosInt(body[f]), `${f} debe ser un entero positivo`);
    if ("active" in body) require_(typeof body.active === "boolean", "active debe ser booleano");
    if (body.active === true && !plan.active && hasActivePlan(plan.patient_id, plan.exercise_id, plan.side, id)) {
      throw new HttpError(409, "ya existe otro plan activo para ese ejercicio y lado");
    }
    db.prepare(`UPDATE exercise_plans SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`).run(
      ...fields.map((f) => (f === "active" ? Number(body[f]) : body[f])),
      id
    );
    res.json(q.planById.get(id));
  });

  // ---- Sesiones ----------------------------------------------------------
  // El cliente (motor de tracking) envía la sesión terminada con sus repeticiones;
  // el servidor calcula los agregados para que no dependan de lo que diga el cliente.
  app.post("/patients/:id/sessions", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const { exercise_code, side, target_angle, plan_id, started_at, ended_at, notes, reps, trace } = req.body ?? {};
    const exercise = q.exerciseByCode.get(exercise_code);
    require_(exercise, "exercise_code desconocido (ver GET /exercises)");
    require_(SIDES.includes(side), "side debe ser 'left' o 'right'");
    require_(isNum(target_angle) && target_angle > 0 && target_angle <= 180, "target_angle debe estar entre 0 y 180");
    const startedUtc = toUtcIso(started_at);
    require_(startedUtc, "started_at debe ser una fecha ISO");
    const endedUtc = ended_at == null ? null : toUtcIso(ended_at);
    require_(ended_at == null || (endedUtc && endedUtc >= startedUtc), "ended_at inválido o anterior a started_at");
    require_(Array.isArray(reps), "reps debe ser una lista (puede ir vacía)");
    reps.forEach((r, i) => {
      require_(isNum(r?.rom_achieved) && r.rom_achieved >= 0 && r.rom_achieved <= 180, `reps[${i}].rom_achieved inválido`);
      require_(r.compensation_flags === undefined || (Array.isArray(r.compensation_flags) && r.compensation_flags.every((f) => typeof f === "string")), `reps[${i}].compensation_flags debe ser lista de textos`);
    });
    let plan = null;
    if (plan_id != null) {
      plan = q.planById.get(plan_id);
      require_(plan && plan.patient_id === patientId, "plan_id no pertenece a este paciente");
    }
    // El registro es opcional (una sesión sin él se guarda igual). Si llega, se valida y se ANALIZA AQUÍ con los datos
    // confiables de la base (ejercicio, lado, meta), no con lo que diga el cliente.
    let analysis = null;
    let storedTrace = null;
    if (trace != null) {
      const parsed = parseTrace(trace);
      require_(!parsed.error, parsed.error);
      storedTrace = { ...parsed.trace, meta: { ...parsed.trace.meta, exercise: exercise.code, side, targetAngle: target_angle, restAngle: exercise.rest_angle, direction: exercise.direction } };
      analysis = analyzeSession(storedTrace, { expectedReps: plan ? plan.sets * plan.reps_per_set : null });
    }

    // Con registro, las repeticiones guardadas son las del análisis del SERVIDOR (una sola fuente de verdad: así las
    // repeticiones y el análisis que ve el fisioterapeuta nunca se contradicen, ni siquiera si el navegador del paciente
    // trae una versión distinta del motor). Si el análisis no encuentra ninguna pero el cliente sí contó, se respeta
    // lo del cliente: nunca se pierde la sesión de un paciente por un fallo del análisis.
    const finalReps = analysis && analysis.reps.length > 0
      ? analysis.reps.map((r) => ({ rom_achieved: r.angle, compensation_flags: r.flags }))
      : reps;
    const roms = finalReps.map((r) => r.rom_achieved);
    const best = roms.length ? (exercise.direction === "decreasing" ? Math.min(...roms) : Math.max(...roms)) : null;
    const compensationCount = finalReps.filter((r) => r.compensation_flags?.length).length;

    const sessionId = transaction(db, () => {
      const info = db
        .prepare(
          `INSERT INTO sessions (patient_id, plan_id, exercise_id, side, target_angle, started_at, ended_at, reps_completed, best_rom, compensation_count, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(patientId, plan_id ?? null, exercise.id, side, target_angle, startedUtc, endedUtc, finalReps.length, best, compensationCount, notes ?? null);
      const sid = Number(info.lastInsertRowid);
      const insRep = db.prepare("INSERT INTO rep_records (session_id, rep_number, rom_achieved, compensation_flags) VALUES (?, ?, ?, ?)");
      finalReps.forEach((r, i) => insRep.run(sid, i + 1, r.rom_achieved, JSON.stringify(r.compensation_flags ?? [])));
      if (storedTrace) {
        db.prepare("INSERT INTO session_analysis (session_id, analyzer_version, summary, trace) VALUES (?, ?, ?, ?)")
          .run(sid, ANALYZER_VERSION, JSON.stringify(analysis), JSON.stringify(storedTrace));
      }
      return sid;
    });
    res.status(201).json(loadSession(sessionId));
  });

  function loadSession(id) {
    const s = db
      .prepare(
        `SELECT s.*, e.code AS exercise_code, e.name AS exercise_name, e.direction
           FROM sessions s JOIN exercises e ON e.id = s.exercise_id WHERE s.id = ?`
      )
      .get(id);
    if (!s) throw new HttpError(404, "sesión no encontrada");
    const reps = db.prepare("SELECT rep_number, rom_achieved, compensation_flags FROM rep_records WHERE session_id = ? ORDER BY rep_number").all(id);
    const stored = db.prepare("SELECT analyzer_version, summary, created_at FROM session_analysis WHERE session_id = ?").get(id);
    const flex = (angle) => (s.direction === "decreasing" ? 180 - angle : angle);
    return {
      ...s,
      has_trace: Boolean(stored),
      analysis: stored ? { ...JSON.parse(stored.summary), analyzer_version: stored.analyzer_version, analyzed_at: stored.created_at } : null,
      flexion: s.best_rom == null ? null : flex(s.best_rom),
      reps: reps.map((r) => ({ ...r, flexion: flex(r.rom_achieved), compensation_flags: JSON.parse(r.compensation_flags) })),
    };
  }

  app.get("/sessions/:id", (req, res) => res.json(loadSession(toId(req.params.id))));

  // Registro completo de la sesión (ángulos + esqueleto) para reproducir el movimiento. Es un dato personal: sin
  // autenticación (Fase 5) cualquiera que conozca el id podría pedirlo, igual que el resto de la API.
  app.get("/sessions/:id/trace", (req, res) => {
    const id = toId(req.params.id);
    const row = db.prepare("SELECT trace FROM session_analysis WHERE session_id = ?").get(id);
    if (!row) throw new HttpError(404, "esta sesión no tiene registro");
    res.type("application/json").send(row.trace);
  });

  // Rehace el análisis con la versión actual del motor, a partir del registro guardado.
  app.post("/sessions/:id/analysis", (req, res) => {
    const id = toId(req.params.id);
    const session = loadSession(id);
    const row = db.prepare("SELECT trace FROM session_analysis WHERE session_id = ?").get(id);
    if (!row) throw new HttpError(404, "esta sesión no tiene registro para analizar");
    const plan = session.plan_id ? q.planById.get(session.plan_id) : null;
    const analysis = analyzeSession(JSON.parse(row.trace), { expectedReps: plan ? plan.sets * plan.reps_per_set : null });
    db.prepare("UPDATE session_analysis SET analyzer_version = ?, summary = ?, created_at = datetime('now') WHERE session_id = ?")
      .run(ANALYZER_VERSION, JSON.stringify(analysis), id);
    res.json(loadSession(id));
  });

  app.get("/patients/:id/sessions", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    res.json(
      db
        .prepare(
          `SELECT s.id, s.started_at, s.ended_at, s.side, s.target_angle, s.reps_completed, s.best_rom, s.compensation_count,
                  CASE WHEN e.direction = 'decreasing' THEN 180 - s.best_rom ELSE s.best_rom END AS flexion,
                  e.code AS exercise_code, e.name AS exercise_name
             FROM sessions s JOIN exercises e ON e.id = s.exercise_id
            WHERE s.patient_id = ? ORDER BY s.started_at DESC`
        )
        .all(patientId)
    );
  });

  // Serie temporal de ROM para graficar la evolución (dashboard del fisioterapeuta, Fase 4).
  app.get("/patients/:id/rom-history", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const code = req.query.exercise;
    require_(typeof code === "string" && q.exerciseByCode.get(code), "query 'exercise' requerido (ver GET /exercises)");
    res.json(
      db
        .prepare(
          `SELECT s.id AS session_id, s.started_at, s.side, s.target_angle, s.best_rom, s.reps_completed, s.compensation_count,
                  (SELECT AVG(rom_achieved) FROM rep_records WHERE session_id = s.id) AS avg_rom
             FROM sessions s JOIN exercises e ON e.id = s.exercise_id
            WHERE s.patient_id = ? AND e.code = ? ORDER BY s.started_at`
        )
        .all(patientId, code)
    );
  });

  // ---- Biblioteca de ejercicios, rutinas y evidencia -------------------------
  app.get("/library", (req, res) => {
    const { area, phase, category, q } = req.query;
    require_(!area || AREAS.includes(area), `area debe ser una de: ${AREAS.join(", ")}`);
    require_(!phase || PHASES.includes(phase), `phase debe ser una de: ${PHASES.join(", ")}`);
    require_(!category || CATEGORIES.includes(category), `category debe ser una de: ${CATEGORIES.join(", ")}`);
    res.json(listLibrary(db, { area, phase, category, q: typeof q === "string" && q.trim() ? q.trim() : undefined }));
  });

  app.get("/library/:code", (req, res) => {
    const item = getLibraryItem(db, req.params.code);
    if (!item) throw new HttpError(404, "ejercicio no encontrado en la biblioteca");
    res.json(item);
  });

  // La clínica puede asociar su propio video a un ejercicio. Solo enlaces de YouTube o Vimeo por https.
  app.patch("/library/:code", (req, res) => {
    if (!db.prepare("SELECT 1 FROM library_items WHERE code = ?").get(req.params.code)) throw new HttpError(404, "ejercicio no encontrado en la biblioteca");
    const { video_url } = req.body ?? {};
    require_(video_url === null || typeof video_url === "string", "video_url debe ser un enlace o null para quitarlo");
    if (video_url) require_(toEmbedUrl(video_url), "Solo se aceptan enlaces https de YouTube o Vimeo con un ID de video válido");
    db.prepare("UPDATE library_items SET video_url = ? WHERE code = ?").run(video_url ? video_url.trim() : null, req.params.code);
    res.json(getLibraryItem(db, req.params.code));
  });

  app.get("/routines", (req, res) => {
    const { area, phase } = req.query;
    require_(!area || AREAS.includes(area), `area debe ser una de: ${AREAS.join(", ")}`);
    require_(!phase || PHASES.includes(phase), `phase debe ser una de: ${PHASES.join(", ")}`);
    res.json(listRoutines(db, { area, phase }));
  });

  app.get("/routines/:code", (req, res) => {
    const routine = getRoutine(db, req.params.code);
    if (!routine) throw new HttpError(404, "rutina no encontrada");
    res.json(routine);
  });

  app.get("/evidence", (_req, res) => res.json(listEvidence(db)));

  // ---- Rutinas asignadas y notas clínicas --------------------------------
  app.post("/patients/:id/routines", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const { routine_code, assigned_by } = req.body ?? {};
    const routine = db.prepare("SELECT id FROM routines WHERE code = ?").get(routine_code);
    require_(routine, "routine_code desconocido (ver GET /routines)");
    if (assigned_by != null) {
      const t = q.userById.get(assigned_by);
      require_(t && t.role === "therapist", "assigned_by no corresponde a un fisioterapeuta");
    }
    try {
      db.prepare("INSERT INTO patient_routines (patient_id, routine_id, assigned_by) VALUES (?, ?, ?)").run(patientId, routine.id, assigned_by ?? null);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, "el paciente ya tiene asignada esta rutina");
      throw err;
    }
    res.status(201).json(assignedRoutines(db, patientId));
  });

  app.delete("/patients/:id/routines/:assignmentId", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const info = db
      .prepare("UPDATE patient_routines SET active = 0 WHERE id = ? AND patient_id = ? AND active = 1")
      .run(toId(req.params.assignmentId), patientId);
    if (info.changes === 0) throw new HttpError(404, "asignación no encontrada");
    res.json(assignedRoutines(db, patientId));
  });

  const notesFor = (patientId) =>
    db
      .prepare(
        `SELECT n.id, n.body, n.created_at, n.author_id, u.name AS author_name
           FROM patient_notes n LEFT JOIN users u ON u.id = n.author_id
          WHERE n.patient_id = ? ORDER BY n.created_at DESC, n.id DESC`
      )
      .all(patientId);

  app.get("/patients/:id/notes", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    res.json(notesFor(patientId));
  });

  app.post("/patients/:id/notes", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    const { author_id, body } = req.body ?? {};
    const text = typeof body === "string" ? body.trim() : "";
    require_(text.length >= 1 && text.length <= 2000, "body debe tener entre 1 y 2000 caracteres");
    const author = q.userById.get(author_id);
    require_(author && author.role === "therapist", "author_id debe ser un fisioterapeuta");
    db.prepare("INSERT INTO patient_notes (patient_id, author_id, body) VALUES (?, ?, ?)").run(patientId, author_id, text);
    res.status(201).json(notesFor(patientId));
  });

  // ---- Estadísticas para los dashboards ---------------------------------
  app.get("/patients/:id/report", (req, res) => {
    const data = patientReport(db, toId(req.params.id), now(), toTz(req.query.tz));
    if (!data) throw new HttpError(404, "paciente no encontrado");
    res.json(data);
  });

  // Asistente de recuperación: recomendaciones para el paciente y propuestas de ajuste para el fisioterapeuta, por plan.
  // `?session=ID` fija cuál es «la sesión de hoy» (por defecto, la más reciente de cada plan).
  app.get("/patients/:id/coach", (req, res) => {
    const patientId = toId(req.params.id);
    getPatient(patientId);
    let sessionId = null;
    if (req.query.session != null) {
      sessionId = Number(req.query.session);
      require_(Number.isInteger(sessionId) && sessionId > 0, "session debe ser el id de una sesión");
    }
    res.json(coachingFor(db, patientId, { now: now(), sessionId }));
  });

  app.get("/patients/:id/overview", (req, res) => {
    const data = patientOverview(db, toId(req.params.id), now(), toTz(req.query.tz));
    if (!data) throw new HttpError(404, "paciente no encontrado");
    res.json(data);
  });

  app.get("/therapists/:id/summary", (req, res) => {
    const data = therapistSummary(db, toId(req.params.id), now(), toTz(req.query.tz));
    if (!data) throw new HttpError(404, "fisioterapeuta no encontrado");
    res.json(data);
  });

  app.use((_req, _res, next) => next(new HttpError(404, "ruta no encontrada")));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "El contenido enviado es demasiado grande (fotos: máximo 300 KB; registro de una sesión: máximo 3 MB)" });
    console.error(err);
    res.status(500).json({ error: "error interno" });
  });

  return app;
}
