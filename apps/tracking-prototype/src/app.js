/**
 * app.js
 * ------------------------------------------------------------------
 * Cablea la interfaz (DOM) con la lógica pura (angleMath, repCounter,
 * compensation) y con el tracker de MediaPipe (poseTracker). Este
 * archivo es intencionalmente "tonto": no tiene lógica de negocio
 * propia, solo orquesta.
 */

import { EXERCISES, MIN_VISIBILITY, measureJoint } from "./angleMath.js";
import { RepCounter } from "./repCounter.js";
import { CompensationDetector } from "./compensation.js";
import { PoseTracker } from "./poseTracker.js";

const els = {
  exercise: document.getElementById("exercise"),
  side: document.getElementById("side"),
  targetAngle: document.getElementById("targetAngle"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  calibrateBtn: document.getElementById("calibrateBtn"),
  resetBtn: document.getElementById("resetBtn"),
  video: document.getElementById("video"),
  canvas: document.getElementById("overlay"),
  angleReadout: document.getElementById("angleReadout"),
  repCount: document.getElementById("repCount"),
  stateBadge: document.getElementById("stateBadge"),
  compensationBanner: document.getElementById("compensationBanner"),
  history: document.getElementById("history"),
  status: document.getElementById("status"),
};

const ctx = els.canvas.getContext("2d");

let tracker = null;
let repCounter = null;
let compensationDetector = new CompensationDetector();
let running = false;
let stream = null;
let currentExercise = EXERCISES.knee_flexion;
let lastLandmarks = null; // último frame con detección válida (lo usa el botón "Calibrar")

function setStatus(msg) {
  els.status.textContent = msg;
}

function populateExerciseOptions() {
  els.exercise.innerHTML = "";
  Object.values(EXERCISES).forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex.id;
    opt.textContent = ex.label;
    els.exercise.appendChild(opt);
  });
}

function newRepCounterForCurrentExercise() {
  const ex = currentExercise;
  const target = Number(els.targetAngle.value) || ex.defaultTargetAngle;
  return new RepCounter({
    targetAngle: target,
    restAngle: ex.restAngleApprox,
    direction: ex.direction,
  });
}

function onExerciseChange() {
  currentExercise = EXERCISES[els.exercise.value];
  els.targetAngle.value = currentExercise.defaultTargetAngle;
  repCounter = newRepCounterForCurrentExercise();
  updateRepUI({ reps: 0, state: repCounter.state });
  els.history.innerHTML = "";
}

function updateRepUI({ reps, state, inTarget = false }) {
  els.repCount.textContent = String(reps);
  els.stateBadge.textContent = inTarget ? "En rango objetivo" : state === "moving" ? "Moviéndose" : "En reposo";
  els.stateBadge.dataset.state = state;
}

function pushHistoryEntry(romAchieved) {
  const li = document.createElement("li");
  const time = new Date().toLocaleTimeString();
  li.textContent = `${time} — ROM alcanzado: ${romAchieved.toFixed(1)}°`;
  els.history.prepend(li);
}

function showCompensation(flags) {
  if (flags.length === 0) {
    els.compensationBanner.hidden = true;
    els.compensationBanner.textContent = "";
  } else {
    els.compensationBanner.hidden = false;
    els.compensationBanner.textContent = `⚠️ Posible compensación: ${flags.join(", ")}`;
  }
}

async function startCamera() {
  setStatus("Solicitando acceso a la cámara…");
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  els.video.srcObject = stream;
  await els.video.play();
  els.canvas.width = els.video.videoWidth || 640;
  els.canvas.height = els.video.videoHeight || 480;

  setStatus("Cargando modelo de detección de pose (MediaPipe)…");
  tracker = await PoseTracker.create();
  compensationDetector = new CompensationDetector({ aspect: (els.video.videoWidth || 4) / (els.video.videoHeight || 3) });
  setStatus("Listo. Ubícate de forma que se vea toda la extremidad en cámara.");

  running = true;
  requestAnimationFrame(renderLoop);
}

function stopCamera() {
  running = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  tracker?.close();
  tracker = null;
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  setStatus("Cámara detenida.");
}

function renderLoop() {
  if (!running) return;

  const timestampMs = performance.now();
  const landmarks = tracker.detect(els.video, timestampMs);

  // Sin frame nuevo de la cámara: no hay nada que actualizar (y no se limpia el canvas, para no parpadear).
  if (landmarks === undefined) {
    requestAnimationFrame(renderLoop);
    return;
  }

  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  if (landmarks) {
    lastLandmarks = landmarks;
    tracker.draw(ctx, landmarks);

    const side = els.side.value;
    // Ángulo en píxeles reales (no en coordenadas normalizadas) y solo si la articulación se ve bien.
    const { angle, visibility } = measureJoint(currentExercise, landmarks, side, { width: els.video.videoWidth, height: els.video.videoHeight });

    if (Number.isFinite(angle) && visibility >= MIN_VISIBILITY) {
      const { repCompleted, state, reps, angle: smooth, inTarget } = repCounter.update(angle, timestampMs);
      els.angleReadout.textContent = smooth == null ? "…" : `${smooth.toFixed(1)}°`;
      updateRepUI({ reps, state, inTarget });
      if (repCompleted) pushHistoryEntry(repCounter.lastRomAchieved);

      const compResult = compensationDetector.check(landmarks, currentExercise.id);
      showCompensation(compResult.flags);
    } else {
      els.angleReadout.textContent = "no se ve";
    }
  } else {
    els.angleReadout.textContent = "—";
  }

  requestAnimationFrame(renderLoop);
}

function calibrate() {
  if (!tracker) {
    setStatus("Inicia la cámara antes de calibrar.");
    return;
  }
  if (!lastLandmarks) {
    setStatus("No se detecta a la persona todavía. Ubícate frente a la cámara e inténtalo de nuevo.");
    return;
  }
  compensationDetector.calibrate(lastLandmarks);
  setStatus("Postura de reposo calibrada. Ya se detectarán compensaciones respecto a esta posición.");
}

function resetSession() {
  repCounter = newRepCounterForCurrentExercise();
  updateRepUI({ reps: 0, state: repCounter.state });
  els.history.innerHTML = "";
  showCompensation([]);
  setStatus("Sesión reiniciada.");
}

populateExerciseOptions();
onExerciseChange();

els.exercise.addEventListener("change", onExerciseChange);
els.targetAngle.addEventListener("change", () => {
  repCounter = newRepCounterForCurrentExercise();
  updateRepUI({ reps: 0, state: repCounter.state });
});
els.startBtn.addEventListener("click", () => startCamera().catch((err) => setStatus(`Error: ${err.message}`)));
els.stopBtn.addEventListener("click", stopCamera);
els.calibrateBtn.addEventListener("click", calibrate);
els.resetBtn.addEventListener("click", resetSession);
