// Cómo se mide cada ejercicio, del lado de la pantalla (probado en tests/exercise.test.mjs).
// El ejercicio se arma a partir de su ESPECIFICACIÓN (qué puntos del cuerpo y qué ángulo), que llega del servidor con el
// plan: agregar un ejercicio nuevo a la base no requiere tocar la pantalla. Rutas relativas (no @engine) para poder
// probarlo con Node.
import { SPEC_BY_CODE, buildExercise } from "../../../tracking-prototype/src/exerciseSpecs.js";

/** Ejercicio listo para el motor a partir de un plan del paciente (`plan.spec` del servidor; si falta, el del catálogo local). */
export function exerciseOf(plan) {
  const spec = plan.spec ?? SPEC_BY_CODE[plan.exercise_code];
  if (!spec) throw new Error(`No se sabe cómo medir el ejercicio «${plan.exercise_code}».`);
  return buildExercise(spec);
}

const POSTURE_STEP = {
  sitting: "Siéntate en una silla firme, con la espalda apoyada.",
  standing: "Párate derecho, con los pies separados al ancho de los hombros.",
  supine: "Acuéstate boca arriba sobre una superficie firme (cama o colchoneta).",
};
const VIEW_STEP = {
  profile: "Ponte de perfil a la cámara, como en la demostración.",
  front: "Ponte de frente a la cámara, como en la demostración.",
};

/** Indicaciones para preparar el espacio, según cómo se mide el ejercicio (postura y vista que pide su especificación). */
export function setupTips(exercise) {
  return [
    "Buena luz y un fondo despejado.",
    POSTURE_STEP[exercise.posture] ?? POSTURE_STEP.sitting,
    VIEW_STEP[exercise.view] ?? VIEW_STEP.profile,
    exercise.posture === "supine"
      ? "La cámara a un lado, a la altura de la cama y a 2 o 3 metros: que se vea de la cadera a la rodilla."
      : "La cámara a la altura de la cadera, a 2 o 3 metros.",
    "Que se vea toda la extremidad; la ropa ajustada ayuda a que la mida mejor.",
  ];
}

/** Aviso cuando la vista no coincide con la que pide el ejercicio (código de viewAdvice → frase). */
export const VIEW_ADVICE_TEXT = {
  turn_profile: "Estás de frente. Gírate de perfil a la cámara para que el ángulo se mida bien.",
  turn_front: "Estás de perfil. Gírate de frente a la cámara para que el ángulo se mida bien.",
};

/** Nombre de la parte del cuerpo para los mensajes («No veo bien tu pierna»). */
export const bodyPartOf = (exercise) => exercise.bodyPart ?? exercise.joint;
