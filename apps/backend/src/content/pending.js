// CONTENIDO ARCHIVADO: ejercicios y rutinas que se escribieron y revisaron, pero que HOY no se pueden usar bien y por eso
// no están en la biblioteca ni se cargan en la base. No se borraron para no perder el trabajo: vuelven por fases
// (docs/ARQUITECTURA.md, sección 13.5):
//   - Fase 2, sesiones GUIADAS (temporizador, sostén, esfuerzo o dolor 0–10, sin medición con cámara):
//       quad_sets, grip_squeeze, scapular_squeeze, forearm_rotation
//   - Fase 3, TRAYECTORIA (amplitud y número de oscilaciones): pendulum
//   - Medición con reservas (segmentos pequeños, sin evidencia citada; solo como «experimental»): ankle_pumps, wrist_flex_ext
// Para reincorporar uno: moverlo a library.js (o routines.js), con su demostración archivada en web/src/demos/archived.js.
import { ALERT_STOP, NO_FORCE } from "./library.js";

void ALERT_STOP;
void NO_FORCE;

export const PENDING_LIBRARY = [
  {
    code: "quad_sets",
    title: "Contracción isométrica de cuádriceps",
    body_area: "rodilla",
    category: "fortalecimiento",
    phase: "proteccion",
    difficulty: 1,
    duration_min: 5,
    tracked_exercise_code: null,
    demo: null,
    summary: "Activa el músculo del muslo sin mover la rodilla. Suele usarse en las primeras etapas, cuando todavía no se puede doblar.",
    steps: [
      "Acuéstate boca arriba o siéntate con la pierna estirada. Si quieres, pon una toalla enrollada bajo la rodilla.",
      "Aprieta el muslo como si empujaras la rodilla contra la toalla, sin mover la pierna.",
      "Sostén 5 segundos respirando con normalidad; no aguantes el aire.",
      "Relaja 5 segundos y repite.",
    ],
    cautions: ["Hazlo solo si tu equipo lo indicó para esta etapa.", ALERT_STOP],
    evidence: [],
  },
  {
    code: "ankle_pumps",
    title: "Bombeo de tobillo",
    body_area: "tobillo",
    category: "movilidad",
    phase: "proteccion",
    difficulty: 1,
    duration_min: 3,
    tracked_exercise_code: null,
    demo: "ankle_pumps",
    summary: "Mueve el tobillo hacia arriba y hacia abajo. Ayuda a mantener el movimiento y suele indicarse para controlar la hinchazón.",
    steps: [
      "Acuéstate o siéntate con la pierna apoyada y, si te lo indicaron, elevada.",
      "Lleva la punta del pie hacia ti y sostén 2 segundos.",
      "Empuja la punta del pie hacia adelante, como pisando un acelerador, y sostén 2 segundos.",
      "Repite despacio, sin prisa.",
    ],
    cautions: [
      "Avisa de inmediato si aparece dolor en la pantorrilla, enrojecimiento, calor o una hinchazón que aumenta.",
      ALERT_STOP,
    ],
    evidence: ["wang2025", "russo2026"],
  },
  {
    code: "forearm_rotation",
    title: "Rotación del antebrazo",
    body_area: "codo",
    category: "movilidad",
    phase: "movilidad",
    difficulty: 1,
    duration_min: 4,
    tracked_exercise_code: null,
    demo: null,
    summary: "Gira la palma hacia arriba y hacia abajo. Se usa tras fracturas de antebrazo, codo y muñeca.",
    steps: [
      "Siéntate con el codo doblado a 90° y apoyado contra el cuerpo o una mesa, con el pulgar hacia arriba.",
      "Gira la palma hacia arriba despacio y sostén 2 segundos.",
      "Gira la palma hacia abajo y sostén 2 segundos.",
      "Mueve solo el antebrazo: el codo se mantiene pegado.",
    ],
    cautions: [NO_FORCE, ALERT_STOP],
    evidence: ["mehta2024", "dasilva2025"],
  },
  {
    code: "wrist_flex_ext",
    title: "Flexión y extensión de muñeca",
    body_area: "muneca",
    category: "movilidad",
    phase: "movilidad",
    difficulty: 1,
    duration_min: 4,
    tracked_exercise_code: null,
    demo: "wrist_flex_ext",
    summary: "Sube y baja la mano para recuperar el movimiento de la muñeca.",
    steps: [
      "Apoya el antebrazo en una mesa con la mano fuera del borde y la palma hacia abajo.",
      "Sube la mano todo lo que puedas sin dolor agudo y sostén 2 segundos.",
      "Baja la mano hasta donde llegue y sostén 2 segundos.",
      "Mueve solo la muñeca, con el antebrazo quieto sobre la mesa.",
    ],
    cautions: [NO_FORCE, ALERT_STOP],
    evidence: ["mehta2024", "zhou2024", "dasilva2025"],
  },
  {
    code: "grip_squeeze",
    title: "Fortalecimiento de agarre",
    body_area: "muneca",
    category: "fortalecimiento",
    phase: "fortalecimiento",
    difficulty: 2,
    duration_min: 4,
    tracked_exercise_code: null,
    demo: null,
    summary: "Aprieta una pelota blanda para recuperar la fuerza de la mano.",
    steps: [
      "Sostén una pelota blanda o una esponja en la palma.",
      "Aprieta con suavidad y sostén 5 segundos.",
      "Suelta despacio y descansa 5 segundos.",
    ],
    cautions: ["Solo cuando tu equipo lo autorice para tu etapa de recuperación.", "No aprietes hasta sentir dolor fuerte.", ALERT_STOP],
    evidence: ["dasilva2025"],
  },
  {
    code: "pendulum",
    title: "Péndulo de hombro (Codman)",
    body_area: "hombro",
    category: "movilidad",
    phase: "proteccion",
    difficulty: 1,
    duration_min: 4,
    tracked_exercise_code: null,
    demo: "pendulum",
    summary: "Balancea el brazo colgando, sin usar sus músculos. Es un movimiento muy suave para las primeras etapas.",
    steps: [
      "De pie, inclínate hacia adelante apoyando la mano sana en una mesa firme.",
      "Deja el brazo afectado colgar completamente relajado.",
      "Balancéalo suavemente moviendo el cuerpo: adelante y atrás, luego de lado a lado y por último en círculos pequeños.",
      "Continúa entre 30 y 60 segundos por serie.",
    ],
    cautions: [
      "El brazo debe estar relajado: lo mueve el cuerpo, no el músculo del hombro.",
      "Si te mareas, siéntate. Cuida la espalda al inclinarte.",
      ALERT_STOP,
    ],
    evidence: ["challoumas2025"],
  },
  {
    code: "scapular_squeeze",
    title: "Retracción de omóplatos",
    body_area: "hombro",
    category: "fortalecimiento",
    phase: "movilidad",
    difficulty: 1,
    duration_min: 4,
    tracked_exercise_code: null,
    demo: null,
    summary: "Junta los omóplatos para activar los músculos de la espalda que estabilizan el hombro.",
    steps: [
      "Siéntate o ponte de pie con la espalda recta y los brazos relajados.",
      "Junta los omóplatos hacia atrás y hacia abajo, como si quisieras sostener un lápiz entre ellos.",
      "Sostén 5 segundos sin subir los hombros ni arquear la parte baja de la espalda.",
      "Relaja y repite.",
    ],
    cautions: ["Hazlo solo si tu equipo lo indicó para tu etapa.", ALERT_STOP],
    evidence: [],
  },
];

export const PENDING_ROUTINES = [
  {
    code: "hombro_primeras_semanas",
    title: "Hombro: primeras semanas",
    summary: "Movimientos suaves para que el hombro no se endurezca mientras se recupera.",
    body_area: "hombro",
    phase: "proteccion",
    duration_min: 14,
    items: [
      { library_code: "pendulum", sets: 3, reps: 1, hold_seconds: 45, note: "45 segundos por serie" },
      { library_code: "scapular_squeeze", sets: 2, reps: 10, hold_seconds: 5 },
      { library_code: "shoulder_flexion", sets: 3, reps: 10, hold_seconds: 2, note: "Con cámara, cuando tu equipo lo indique" },
    ],
  },
  {
    code: "codo_antebrazo",
    title: "Codo y antebrazo",
    summary: "Recupera el doblez del codo y el giro del antebrazo.",
    body_area: "codo",
    phase: "movilidad",
    duration_min: 12,
    items: [
      { library_code: "elbow_flexion", sets: 3, reps: 10, hold_seconds: 2, note: "Con cámara" },
      { library_code: "forearm_rotation", sets: 3, reps: 10, hold_seconds: 2 },
    ],
  },
  {
    code: "muneca_mano",
    title: "Muñeca y mano",
    summary: "Movilidad de la muñeca y, cuando se autorice, fuerza de agarre.",
    body_area: "muneca",
    phase: "movilidad",
    duration_min: 12,
    items: [
      { library_code: "wrist_flex_ext", sets: 3, reps: 10, hold_seconds: 2 },
      { library_code: "forearm_rotation", sets: 2, reps: 10, hold_seconds: 2 },
      { library_code: "grip_squeeze", sets: 3, reps: 10, hold_seconds: 5, note: "Solo cuando tu equipo lo autorice" },
    ],
  },
];
