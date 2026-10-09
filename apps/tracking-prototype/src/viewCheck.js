/**
 * viewCheck.js
 * ------------------------------------------------------------------
 * ¿La persona está de PERFIL o de FRENTE a la cámara? El ángulo se mide en el plano de la imagen: si el ejercicio pide
 * perfil (rodilla, codo, elevación de pierna) y la persona está de frente, el ángulo medido sale mucho menor que el real.
 * Avisar antes de empezar evita sesiones medidas mal sin que nadie lo note.
 *
 * Se usa la separación entre los dos hombros relativa al largo del tronco, ambos en píxeles. Es una razón (no depende de
 * qué tan lejos esté la persona) y no depende de la orientación: acostado de perfil también da un valor pequeño.
 */
import { MIN_VISIBILITY } from "./angleMath.js";

export const PROFILE_MAX_RATIO = 0.4; // por debajo: de perfil (los hombros casi se superponen)
export const FRONT_MIN_RATIO = 0.65; // por encima: de frente (en una persona de frente ronda 0,8)

const SHOULDERS = [11, 12];
const HIPS = [23, 24];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** @returns {{view:"profile"|"front"|"oblique"|"unknown", ratio:number|null}} */
export function estimateView(landmarks, frame) {
  const pts = [...SHOULDERS, ...HIPS].map((i) => landmarks?.[i]);
  if (!pts.every(Boolean) || pts.some((p) => (p.visibility ?? 1) < MIN_VISIBILITY)) return { view: "unknown", ratio: null };
  const px = pts.map((p) => ({ x: p.x * frame.width, y: p.y * frame.height }));
  const [sl, sr, hl, hr] = px;
  const torso = dist({ x: (sl.x + sr.x) / 2, y: (sl.y + sr.y) / 2 }, { x: (hl.x + hr.x) / 2, y: (hl.y + hr.y) / 2 });
  if (!(torso > 1)) return { view: "unknown", ratio: null };
  const ratio = dist(sl, sr) / torso;
  return { view: ratio <= PROFILE_MAX_RATIO ? "profile" : ratio >= FRONT_MIN_RATIO ? "front" : "oblique", ratio: Math.round(ratio * 100) / 100 };
}

/**
 * Qué decirle a la persona. Solo avisa de un desajuste CLARO (pide perfil y está de frente, o al revés): de lado a medias
 * («oblique») se tolera, y si no se puede saber («unknown») no se molesta a nadie.
 * @returns {"turn_profile"|"turn_front"|null}
 */
export function viewAdvice(expected, estimated) {
  if (expected === "profile" && estimated.view === "front") return "turn_profile";
  if (expected === "front" && estimated.view === "profile") return "turn_front";
  return null;
}
