// Rutinas sugeridas: combinaciones de ejercicios de la biblioteca. Las series, repeticiones y tiempos son
// puntos de partida habituales, NO una prescripción; el fisioterapeuta asigna la rutina y ajusta la dosis.
// Solo se incluyen rutinas de DOS o más ejercicios que hoy se pueden usar; las demás están archivadas en pending.js.

export const ROUTINES = [
  {
    code: "rodilla_movilidad_temprana",
    title: "Movilidad temprana de rodilla",
    summary: "Recupera el doblez de la rodilla y fortalece el muslo con la pierna estirada.",
    body_area: "rodilla",
    phase: "movilidad",
    duration_min: 11,
    items: [
      { library_code: "knee_flexion", sets: 3, reps: 10, hold_seconds: 2, note: "Con cámara" },
      { library_code: "straight_leg_raise", sets: 2, reps: 10, hold_seconds: 2, note: "Con cámara, solo si tu equipo lo autorizó" },
    ],
  },
];
