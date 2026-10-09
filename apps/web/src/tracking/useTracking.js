import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_VISIBILITY, measureJoint } from "@engine/angleMath.js";
import { RepCounter } from "@engine/repCounter.js";
import { CompensationDetector } from "@engine/compensation.js";
import { PoseTracker } from "@engine/poseTracker.js";
import { TraceRecorder } from "@engine/traceRecorder.js";
import { estimateView, viewAdvice as adviceFor } from "@engine/viewCheck.js";

// Conecta la cámara + MediaPipe con el motor de la Fase 1 (angleMath, repCounter, compensation).
// Este hook orquesta; la lógica de negocio sigue viviendo en el motor, que está probado por separado.
//
// Precisión (ver docs/FASE-1-TRACKING.md, «Correcciones posteriores»):
//  - el ángulo se mide en PÍXELES reales (no en coordenadas normalizadas, que deforman el ángulo en un video 4:3);
//  - si la articulación no se ve bien (visibilidad < 0.5) la lectura se descarta en vez de contar un ángulo adivinado;
//  - el contador filtra la señal y detecta repeticiones por la forma del movimiento, no por umbrales fijos;
//  - cada cuadro se anota en un REGISTRO (ángulo, visibilidad, alertas de postura y el esqueleto; nunca video). Al terminar,
//    `buildTrace()` lo entrega para el análisis posterior de la sesión y para guardarlo (docs/ARQUITECTURA.md, sección 12).

export function useTracking({ exercise, side, targetAngle }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const live = useRef({ stream: null, tracker: null, raf: 0, running: false, lastLandmarks: null });
  const engine = useRef({ counter: null, detector: new CompensationDetector(), pending: new Set(), records: [], startedAt: null, recorder: null });

  const [phase, setPhase] = useState("idle"); // idle | loading | running | error
  const [message, setMessage] = useState("");
  const [angle, setAngle] = useState(null);
  const [reps, setReps] = useState(0);
  const [inTarget, setInTarget] = useState(false);
  const [flags, setFlags] = useState([]);
  const [calibrated, setCalibrated] = useState(false);
  const [visible, setVisible] = useState(true); // ¿se ve bien la articulación que se mide?
  const [model, setModel] = useState(null); // variante del modelo cargada ("full" | "lite")
  const [viewAdvice, setViewAdvice] = useState(null); // «turn_profile» | «turn_front» | null: la persona no está como pide el ejercicio
  const lastUi = useRef({ angleAt: 0, flagsKey: "", seen: true, viewTick: 0, advice: null });

  const stop = useCallback(() => {
    const l = live.current;
    l.running = false;
    cancelAnimationFrame(l.raf);
    l.stream?.getTracks().forEach((t) => t.stop());
    l.stream = null;
    l.tracker?.close();
    l.tracker = null;
    const c = canvasRef.current;
    c?.getContext("2d").clearRect(0, 0, c.width, c.height);
    setPhase((p) => (p === "error" ? p : "idle"));
    setAngle(null);
    setFlags([]);
  }, []);

  useEffect(() => stop, [stop]); // al salir de la pantalla, apagar cámara y modelo

  const loop = useCallback(() => {
    const l = live.current;
    if (!l.running) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ts = performance.now();
    const landmarks = l.tracker.detect(video, ts);

    if (landmarks === undefined) { // la cámara aún no entrega un frame nuevo
      l.raf = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const e = engine.current;
    let nextAngle = null;

    if (landmarks) {
      l.lastLandmarks = landmarks;
      l.tracker.draw(ctx, landmarks);
      // Cada ~0,5 s se comprueba si está de perfil o de frente, como pide el ejercicio (el ángulo sale mal si no).
      if (++lastUi.current.viewTick % 15 === 0) {
        const advice = adviceFor(exercise.view, estimateView(landmarks, { width: video.videoWidth, height: video.videoHeight }));
        if (advice !== lastUi.current.advice) { lastUi.current.advice = advice; setViewAdvice(advice); }
      }
      const { angle: measured, visibility } = measureJoint(exercise, landmarks, side, { width: video.videoWidth, height: video.videoHeight });
      const seen = Number.isFinite(measured) && visibility >= MIN_VISIBILITY;
      if (seen !== lastUi.current.seen) {
        lastUi.current.seen = seen;
        setVisible(seen);
      }
      // Se registran TODOS los cuadros con persona (también los de visibilidad baja): el análisis posterior los descarta
      // por su cuenta y así puede decir qué porcentaje de la sesión se vio bien.
      if (Number.isFinite(measured)) e.recorder?.addSample(ts, measured, visibility, landmarks);
      if (seen) {
        const out = e.counter.update(measured, ts);
        nextAngle = out.angle; // el ángulo SUAVIZADO: el número en pantalla deja de temblar
        setInTarget(out.inTarget);
        if (out.repCompleted) {
          // Las alertas de postura vistas durante el movimiento se asocian a esa repetición.
          e.records.push({ rom_achieved: e.counter.lastRomAchieved, compensation_flags: [...e.pending] });
          e.pending.clear();
          setReps(out.reps);
        }
      }
      const found = e.detector.check(landmarks, exercise.id).flags;
      found.forEach((f) => e.pending.add(f));
      e.recorder?.setFlags(ts, found);
      const key = found.join("|");
      if (key !== lastUi.current.flagsKey) {
        lastUi.current.flagsKey = key;
        setFlags(found);
      }
    }
    if (ts - lastUi.current.angleAt > 90) { // ~11 actualizaciones/s bastan para leer el número
      lastUi.current.angleAt = ts;
      setAngle(nextAngle);
    }
    l.raf = requestAnimationFrame(loop);
  }, [exercise, side]);

  const start = useCallback(async () => {
    if (live.current.running) return;
    try {
      setPhase("loading");
      setMessage("Solicitando acceso a la cámara…");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      live.current.stream = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      canvasRef.current.width = video.videoWidth || 640;
      canvasRef.current.height = video.videoHeight || 480;

      setMessage("Cargando el modelo de detección de movimiento…");
      live.current.tracker = await PoseTracker.create();
      setModel(live.current.tracker.modelVariant ?? null);

      engine.current.counter = new RepCounter({ targetAngle, restAngle: exercise.restAngleApprox, direction: exercise.direction });
      engine.current.detector = new CompensationDetector({ aspect: (video.videoWidth || 4) / (video.videoHeight || 3) });
      engine.current.pending = new Set();
      engine.current.records = [];
      lastUi.current.seen = true;
      lastUi.current.advice = null;
      setViewAdvice(null);
      setVisible(true);
      engine.current.startedAt = new Date();
      engine.current.recorder = new TraceRecorder({
        exercise: exercise.id, side, targetAngle, restAngle: exercise.restAngleApprox, direction: exercise.direction,
        model: live.current.tracker.modelVariant ?? null, width: video.videoWidth || 640, height: video.videoHeight || 480,
        startedAt: engine.current.startedAt.toISOString(),
      });
      setReps(0);
      setCalibrated(false);
      setMessage("Listo. Colócate para que se vea toda la extremidad y pulsa «Calibrar reposo».");
      setPhase("running");
      live.current.running = true;
      live.current.raf = requestAnimationFrame(loop);
    } catch (err) {
      stop();
      setPhase("error");
      setMessage(
        err?.name === "NotAllowedError"
          ? "No diste permiso a la cámara. Actívalo en el candado de la barra de direcciones y vuelve a intentarlo."
          : err?.name === "NotFoundError"
            ? "No encontramos una cámara conectada."
            : `No se pudo iniciar: ${err?.message ?? err}`
      );
    }
  }, [exercise, side, targetAngle, loop, stop]);

  const calibrate = useCallback(() => {
    const lm = live.current.lastLandmarks;
    if (!lm) {
      setMessage("Aún no te detecto. Colócate frente a la cámara con el cuerpo visible e inténtalo de nuevo.");
      return;
    }
    engine.current.detector.calibrate(lm);
    setCalibrated(true);
    setMessage("Postura de reposo calibrada. Ya puedes empezar tus repeticiones.");
  }, []);

  // Foto final de la sesión para guardarla en el backend.
  const snapshot = useCallback(
    () => ({ started_at: engine.current.startedAt, ended_at: new Date(), reps: engine.current.records.map((r) => ({ ...r })) }),
    []
  );

  // Registro de la sesión (formato telerehab-trace/2: números y esqueleto, ningún video ni imagen). null si aún no empezó.
  const buildTrace = useCallback(() => engine.current.recorder?.build() ?? null, []);

  // Herramienta técnica (?debug=1): el registro más lo que contó el conteo en vivo y lo que la persona contó a mano.
  // `node scripts/replay.mjs <archivo>` en apps/tracking-prototype compara ambos sin cámara.
  const exportTrace = useCallback(
    (manualCount = null) => ({ ...buildTrace(), reps_detected: engine.current.records.map((r) => r.rom_achieved), manual_count: manualCount }),
    [buildTrace]
  );

  return { videoRef, canvasRef, phase, message, angle, reps, inTarget, flags, calibrated, visible, viewAdvice, model, start, stop, calibrate, snapshot, buildTrace, exportTrace };
}
