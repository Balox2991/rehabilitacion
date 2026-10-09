/**
 * exerciseSpecs.js
 * ------------------------------------------------------------------
 * Los ejercicios medidos con cámara, definidos como DATOS (una especificación por ejercicio) y no como código.
 *
 * Qué hace que cada ejercicio sea distinto, y es lo ÚNICO que cambia entre ellos: QUÉ NÚMERO se saca del cuerpo en
 * cada cuadro. Todo lo demás (filtrado, conteo de repeticiones, tempo, fatiga, observaciones, guardado, replay) trabaja
 * sobre una señal de un solo número y es igual para todos (docs/ARQUITECTURA.md, sección 13).
 *
 * Una especificación dice cómo armar esa señal:
 *   - `joint_angle`:   ángulo interior de una articulación con 3 puntos (rodilla: cadera–rodilla–tobillo).
 *   - `segment_angle`: ángulo de UN segmento del cuerpo contra un eje de la imagen. `horizontal` = elevación sobre la
 *     horizontal (elevación de pierna recta: el muslo sube de la camilla); `vertical` = separación respecto a la
 *     vertical hacia abajo (0° colgando, 90° horizontal, 180° arriba).
 *
 * Este módulo no depende de nada (ni de angleMath.js): lo usan el navegador y el servidor, y el servidor siembra su
 * catálogo de ejercicios directamente desde aquí, así que no hay dos listas que se desincronicen.
 */

// Índices de MediaPipe Pose (BlazePose, 33 puntos) por lado.
const POINT_IDS = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};

export const POINT_NAMES = Object.keys(POINT_IDS.left);
export const MEASURE_TYPES = ["joint_angle", "segment_angle"];
export const REFERENCES = ["horizontal", "vertical"];
export const VIEWS = ["profile", "front"];
export const DIRECTIONS = ["increasing", "decreasing"];
export const POSTURES = ["sitting", "standing", "supine"];

/** Especificaciones de los ejercicios que hoy se miden con cámara. `rest`/`target` son ángulos en grados. */
export const SPECS = [
  {
    code: "knee_flexion", label: "Flexión de rodilla", joint: "rodilla", bodyPart: "rodilla",
    measure: { type: "joint_angle", points: ["hip", "knee", "ankle"] },
    direction: "decreasing", rest: 175, target: 90, view: "profile", posture: "sitting",
  },
  {
    code: "elbow_flexion", label: "Flexión de codo", joint: "codo", bodyPart: "codo",
    measure: { type: "joint_angle", points: ["shoulder", "elbow", "wrist"] },
    direction: "decreasing", rest: 170, target: 60, view: "profile", posture: "sitting",
  },
  {
    code: "shoulder_flexion", label: "Flexión de hombro (brazo al frente/arriba)", joint: "hombro", bodyPart: "hombro",
    measure: { type: "joint_angle", points: ["hip", "shoulder", "elbow"] },
    direction: "increasing", rest: 15, target: 150, view: "front", posture: "standing",
  },
  {
    // La rodilla NO se dobla en este ejercicio: se mide cuánto sube el muslo sobre la camilla. Con el motor de «flexión de
    // rodilla» daba 0 repeticiones aunque el paciente hiciera todas. Solo hacen falta cadera y rodilla.
    code: "straight_leg_raise", label: "Elevación de pierna recta", joint: "rodilla", bodyPart: "pierna",
    measure: { type: "segment_angle", from: "hip", to: "knee", reference: "horizontal" },
    direction: "increasing", rest: 0, target: 45, view: "profile", posture: "supine",
  },
];

const CODE = /^[a-z][a-z0-9_]{2,40}$/;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fail = (error) => ({ error: `spec: ${error}` });

/** Valida una especificación (de la base o de un fisioterapeuta). Devuelve { spec } normalizada o { error }. */
export function validateSpec(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("debe ser un objeto");
  const { code, label, joint, bodyPart, measure, direction, rest, target, view, posture } = raw;
  if (typeof code !== "string" || !CODE.test(code)) return fail("code inválido (minúsculas, números y _; 3–41 caracteres)");
  if (typeof label !== "string" || !label.trim() || label.length > 80) return fail("label es obligatorio (máx. 80)");
  if (typeof joint !== "string" || !joint.trim()) return fail("joint es obligatorio");
  if (!measure || !MEASURE_TYPES.includes(measure.type)) return fail(`measure.type debe ser uno de ${MEASURE_TYPES.join(", ")}`);
  let cleanMeasure;
  if (measure.type === "joint_angle") {
    const pts = measure.points;
    if (!Array.isArray(pts) || pts.length !== 3 || new Set(pts).size !== 3 || !pts.every((p) => POINT_NAMES.includes(p))) return fail(`measure.points debe tener 3 puntos distintos de ${POINT_NAMES.join(", ")}`);
    cleanMeasure = { type: "joint_angle", points: [...pts] };
  } else {
    const { from, to, reference } = measure;
    if (!POINT_NAMES.includes(from) || !POINT_NAMES.includes(to) || from === to) return fail("measure.from y measure.to deben ser dos puntos distintos conocidos");
    if (!REFERENCES.includes(reference)) return fail(`measure.reference debe ser uno de ${REFERENCES.join(", ")}`);
    cleanMeasure = { type: "segment_angle", from, to, reference };
  }
  if (!DIRECTIONS.includes(direction)) return fail(`direction debe ser uno de ${DIRECTIONS.join(", ")}`);
  if (!isNum(rest) || rest < 0 || rest > 180) return fail("rest debe estar entre 0 y 180");
  if (!isNum(target) || target < 0 || target > 180) return fail("target debe estar entre 0 y 180");
  if ((direction === "increasing" && target <= rest) || (direction === "decreasing" && target >= rest)) return fail("target debe estar en el sentido del movimiento respecto a rest");
  if (!VIEWS.includes(view)) return fail(`view debe ser uno de ${VIEWS.join(", ")}`);
  if (!POSTURES.includes(posture)) return fail(`posture debe ser uno de ${POSTURES.join(", ")}`);
  return {
    spec: { code, label: label.trim(), joint: joint.trim(), bodyPart: (bodyPart ?? joint).trim(), measure: cleanMeasure, direction, rest, target, view, posture },
  };
}

/** Puntos (nombres) que intervienen en la medición, en orden: 3 para un ángulo de articulación, 2 para un segmento. */
export const measuredPointNames = (measure) => (measure.type === "joint_angle" ? measure.points : [measure.from, measure.to]);

/**
 * Convierte una especificación en el objeto de ejercicio que usa el motor.
 * `getPoints(landmarks, side)` devuelve los puntos medidos (3 o 2); `kind`/`reference` dicen cómo calcular el ángulo
 * (lo hace angleMath.measureJoint, en píxeles reales).
 */
export function buildExercise(spec) {
  const checked = validateSpec(spec);
  if (checked.error) throw new Error(`Ejercicio «${spec?.code}» inválido: ${checked.error}`);
  const s = checked.spec;
  const names = measuredPointNames(s.measure);
  return {
    id: s.code, label: s.label, joint: s.joint, bodyPart: s.bodyPart, spec: s,
    kind: s.measure.type === "joint_angle" ? "joint" : "segment",
    reference: s.measure.type === "segment_angle" ? s.measure.reference : null,
    pointNames: names,
    getPoints: (lm, side) => names.map((n) => lm[POINT_IDS[side === "left" ? "left" : "right"][n]]),
    restAngleApprox: s.rest, defaultTargetAngle: s.target, direction: s.direction, view: s.view, posture: s.posture,
  };
}

export const SPEC_BY_CODE = Object.fromEntries(SPECS.map((s) => [s.code, s]));
