// DEMOSTRACIONES ARCHIVADAS de los ejercicios que hoy no están en la biblioteca (ver backend/src/content/pending.js).
// No se exponen en DEMOS: así la biblioteca solo anuncia animaciones de ejercicios que existen y la prueba
// «cada demostración la usa algún ejercicio» sigue siendo estricta. Al reincorporar un ejercicio, moverla a DEMOS.
import { P, line, move, pt, round, still } from "./demos.js";

export const ARCHIVED_DEMOS = {
  ankle_pumps: {
    title: "Bombeo de tobillo",
    tracked: false,
    range: () => [-20, 40],
    frame(pf) {
      const K = P(48, 116);
      const A = P(170, 116);
      const toe = pt(A, -90 + pf, 46);
      const heel = pt(A, 90 + pf, 12);
      return {
        furniture: [line(P(20, 146), P(300, 146)), line(P(96, 130), P(130, 130)), line(P(96, 130), P(96, 146)), line(P(130, 130), P(130, 146))],
        bones: [still(K, A), move(heel, toe)],
        head: null,
        joints: [A],
        arc: { a: K, b: A, c: toe },
        label: pf >= 0 ? `Punta hacia abajo ${round(pf)}°` : `Punta hacia ti ${round(-pf)}°`,
        note: "Vista lateral de la pierna",
      };
    },
  },
  wrist_flex_ext: {
    title: "Flexión y extensión de muñeca",
    tracked: false,
    range: () => [-50, 50],
    frame(w) {
      const E = P(44, 128);
      const W = P(196, 128);
      const tip = pt(W, w, 52);
      return {
        furniture: [line(P(30, 140), P(196, 140)), line(P(40, 140), P(40, 190)), line(P(190, 140), P(190, 190))],
        bones: [still(E, W), move(W, tip)],
        head: null,
        joints: [W],
        arc: null,
        label: w < 0 ? `Extensión ${round(-w)}°` : `Flexión ${round(w)}°`,
        note: "Antebrazo apoyado, la mano fuera de la mesa",
      };
    },
  },
  pendulum: {
    title: "Péndulo de hombro",
    tracked: false,
    range: () => [-28, 28],
    frame(v) {
      const H = P(118, 132);
      const S = pt(H, -22, 80); // tronco inclinado hacia adelante, casi horizontal
      const hand = pt(S, 90 + v, 88);
      return {
        furniture: [line(P(226, 140), P(304, 140)), line(P(298, 140), P(298, 205)), line(P(30, 205), P(300, 205))],
        bones: [still(H, S), still(H, P(120, 172)), still(P(120, 172), P(120, 204)), still(P(120, 204), P(146, 204)), still(S, P(240, 138)), move(S, hand)],
        head: pt(S, -22, 24),
        joints: [hand],
        arc: null,
        label: "Balanceo suave",
        note: "El brazo cuelga relajado; lo mueve el cuerpo",
      };
    },
  },
};
