import { PoseTracker } from "@engine/poseTracker.js";
import { runPosePass } from "@engine/videoPass.js";

// Analiza un VIDEO GRABADO (por ejemplo, desde el celular) en el propio navegador: el archivo no se sube a ningún lado.
// Recorre el video cuadro por cuadro con el mismo detector de la cámara en vivo y entrega el registro de la sesión
// (números y esqueleto) para analizarlo y guardarlo igual que una sesión en vivo. La parte lógica es runPosePass (probada).

export const MAX_VIDEO_SECONDS = 180;
export const MAX_VIDEO_MB = 600;

export class VideoError extends Error {}

const once = (el, event, ms, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new VideoError(message)); }, ms);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new VideoError("No pudimos leer ese video. Prueba con uno grabado con la cámara del celular (MP4 o MOV).")); };
    const cleanup = () => { clearTimeout(timer); el.removeEventListener(event, ok); el.removeEventListener("error", bad); };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });

async function seek(video, seconds) {
  if (Math.abs(video.currentTime - seconds) < 0.001) return;
  const done = once(video, "seeked", 8000, "El video tardó demasiado en responder.");
  video.currentTime = seconds;
  await done;
}

/**
 * @param {File} file
 * @param {{exercise:object, side:string, targetAngle:number, onProgress?:(f:number)=>void, shouldStop?:()=>boolean}} o
 * @returns {Promise<{cancelled:boolean, trace?:object, seen:number, total:number, seconds:number}>}
 */
export async function analyzeVideoFile(file, { exercise, side, targetAngle, onProgress, shouldStop }) {
  if (!file.type.startsWith("video/")) throw new VideoError("Ese archivo no es un video.");
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new VideoError(`El video pesa demasiado (máximo ${MAX_VIDEO_MB} MB).`);

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let tracker = null;
  try {
    const loaded = once(video, "loadedmetadata", 15000, "El video tardó demasiado en abrirse.");
    video.src = url;
    await loaded;
    if (!video.videoWidth) throw new VideoError("No pudimos leer las imágenes de ese video.");
    // Algunos videos grabados desde el navegador no declaran su duración: se obliga al navegador a calcularla.
    if (!Number.isFinite(video.duration)) {
      await seek(video, 1e7).catch(() => {});
      await seek(video, 0);
    }
    const seconds = video.duration;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new VideoError("No pudimos saber cuánto dura ese video.");
    if (seconds > MAX_VIDEO_SECONDS) throw new VideoError(`El video dura ${Math.round(seconds)} s; el máximo es ${MAX_VIDEO_SECONDS / 60} minutos. Graba solo la serie del ejercicio.`);

    tracker = await PoseTracker.create();
    const result = await runPosePass({
      durationMs: Math.floor(seconds * 1000),
      getLandmarks: async (tMs) => {
        await seek(video, tMs / 1000);
        return tracker.detect(video, tMs) ?? null; // undefined = mismo cuadro que el anterior: se trata como «no se ve a nadie»
      },
      exercise, side, targetAngle,
      frame: { width: video.videoWidth, height: video.videoHeight },
      onProgress, shouldStop,
      meta: { model: tracker.modelVariant ?? null, startedAt: new Date().toISOString(), source: "video" },
    });
    return { ...result, seconds };
  } finally {
    tracker?.close();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
