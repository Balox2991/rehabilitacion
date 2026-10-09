// Demostraciones animadas de ejercicios (vista lateral, figura de palitos).
//
// Cada demostración es un modelo cinemático: una función `frame(v)` que, dado el parámetro que se mueve
// (un ángulo en grados), devuelve las posiciones de los huesos. El ángulo que se muestra en pantalla se
// CALCULA sobre esas posiciones con el mismo `calculateAngle` del motor de tracking, así que la demostración
// usa la misma definición de ángulo que la medición real (ángulo interno de la articulación).
//
//  - `range(target)`: [inicio, fin] del parámetro. Si el ejercicio se mide con cámara, `target` es el ángulo
//    objetivo del plan del paciente y la demostración termina exactamente ahí.
//  - Coordenadas SVG: x hacia la derecha, y hacia abajo; ángulos en grados, 0° = derecha, positivo = horario.

// Ruta relativa (y no el alias @engine) para poder probar este módulo con `node --test`, que no conoce los alias de Vite.
import { calculateAngle } from "../../../tracking-prototype/src/angleMath.js";

export const rad = (d) => (d * Math.PI) / 180;
export const P = (x, y) => ({ x, y });
export const pt = (o, deg, len) => P(o.x + Math.cos(rad(deg)) * len, o.y + Math.sin(rad(deg)) * len);
export const round = Math.round;

export const move = (a, b) => ({ a, b, role: "move" });
export const still = (a, b) => ({ a, b, role: "still" });
export const line = (a, b) => ({ a, b });

export const DEMOS = {
  // ------------------------------------------------------------------------------ rodilla (con cámara)
  knee_flexion: {
    title: "Flexión de rodilla sentado",
    tracked: true,
    range: (target = 90) => [12, 186 - target],
    frame(theta) {
      const H = P(108, 104);
      const S = pt(H, -90, 60);
      const K = pt(H, 6, 64);
      const A = pt(K, theta, 62);
      const E = pt(S, 80, 32);
      return {
        furniture: [line(P(78, 112), P(190, 112)), line(P(78, 112), P(78, 48)), line(P(84, 112), P(84, 182)), line(P(186, 112), P(186, 182)), line(P(30, 182), P(300, 182))],
        bones: [
          still(H, S), still(S, E), still(E, pt(E, 10, 30)),
          move(H, K), move(K, A), move(A, pt(A, theta - 90, 24)),
        ],
        head: pt(S, -90, 22),
        joints: [K, A],
        arc: { a: H, b: K, c: A },
        label: `Rodilla ${round(calculateAngle(H, K, A))}°`,
      };
    },
  },

  // ------------------------------------------------------------------------------ codo (con cámara)
  elbow_flexion: {
    title: "Flexión de codo sentado",
    tracked: true,
    range: (target = 60) => [84, target - 94], // brazo a 86° ⇒ ángulo interior = φ + 94
    frame(phi) {
      const H = P(120, 150);
      const S = pt(H, -90, 62);
      const E = pt(S, 86, 54);
      const W = pt(E, phi, 52);
      const K = P(190, 150);
      return {
        furniture: [line(P(90, 158), P(200, 158)), line(P(90, 158), P(90, 92)), line(P(96, 158), P(96, 205)), line(P(194, 158), P(194, 205)), line(P(30, 205), P(300, 205))],
        bones: [still(H, S), still(H, K), still(K, P(190, 204)), still(P(190, 204), P(214, 204)), move(S, E), move(E, W), move(W, pt(W, phi, 16))],
        head: pt(S, -90, 22),
        joints: [E, W],
        arc: { a: S, b: E, c: W },
        label: `Codo ${round(calculateAngle(S, E, W))}°`,
      };
    },
  },

  // ------------------------------------------------------------------------------ hombro (con cámara)
  shoulder_flexion: {
    title: "Elevación frontal del brazo",
    tracked: true,
    range: (target = 150) => [80, 90 - target],
    frame(theta) {
      const H = P(120, 148);
      const S = pt(H, -90, 64);
      const E = pt(S, theta, 40);
      const W = pt(E, theta, 38);
      const K = P(121, 181);
      const A = P(122, 212);
      return {
        furniture: [line(P(30, 214), P(300, 214))],
        bones: [still(H, S), still(H, K), still(K, A), still(A, P(146, 212)), move(S, E), move(E, W), move(W, pt(W, theta, 12))],
        head: pt(S, -90, 22),
        joints: [E, W],
        arc: { a: H, b: S, c: E },
        label: `Hombro ${round(calculateAngle(H, S, E))}°`,
      };
    },
  },

  // ------------------------------------------------------------------------------ pierna (con cámara: ángulo de segmento)
  straight_leg_raise: {
    title: "Elevación de pierna recta",
    tracked: true,
    range: (target = 45) => [0, target], // el ángulo mostrado es la elevación de la pierna sobre la camilla: lo mismo que mide la cámara
    frame(e) {
      const H = P(140, 140);
      const S = P(62, 140);
      const A = pt(H, -e, 118);
      const K2 = pt(H, -62, 60);
      const A2 = pt(K2, 58, 60);
      return {
        furniture: [line(P(30, 152), P(300, 152))],
        bones: [still(H, S), still(H, K2), still(K2, A2), still(A2, P(A2.x + 18, A2.y)), move(H, A), move(A, pt(A, -e - 90, 20))],
        head: P(42, 140),
        joints: [A],
        arc: { a: P(H.x + 64, H.y), b: H, c: A },
        label: `Elevación ${round(e)}°`,
      };
    },
  },



};

export const hasDemo = (key) => Boolean(key && DEMOS[key]);

// Arco que marca el ángulo en el vértice `b` entre los rayos hacia `a` y `c` (siempre el ángulo interior, < 180°).
export function arcGeometry({ a, b, c }, r = 26) {
  const a1 = Math.atan2(a.y - b.y, a.x - b.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const start = { x: b.x + Math.cos(a1) * r, y: b.y + Math.sin(a1) * r };
  const end = { x: b.x + Math.cos(a1 + delta) * r, y: b.y + Math.sin(a1 + delta) * r };
  const mid = a1 + delta / 2;
  return {
    d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 0 ${delta > 0 ? 1 : 0} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    labelAt: { x: b.x + Math.cos(mid) * (r + 12), y: b.y + Math.sin(mid) * (r + 12) },
  };
}
