// Textos del asistente de recuperación (probados en tests/coachText.test.mjs).
// El motor (coach.js) devuelve CÓDIGOS con los números de ese paciente; aquí se convierten en frases, dichas distinto al
// paciente (llano, sin culpar, con una acción) y al fisioterapeuta (técnico, con cifras y la propuesta).
// Cada recomendación trae su «por qué» con los datos del propio paciente. Nada de esto es una indicación clínica nueva.

const n = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10).replace(".", ","));
const pl = (count, one, many) => (count === 1 ? one : many);

const PATIENT = {
  reached_target: (d) => ({
    title: "¡Llegaste a tu meta!",
    text: `Tu mejor movimiento fue de ${n(d.best)}° y tu meta es de ${n(d.target)}°. Cuéntaselo a tu fisioterapeuta: él decide cómo seguir.`,
    why: `Se cuenta como lograda desde 8° antes de la meta, porque la cámara tiene ese margen de error.`,
  }),
  first_record: (d) => ({
    title: "Tu punto de partida",
    text: `Hoy tu mejor movimiento fue de ${n(d.best)}° (tu meta es de ${n(d.target)}°). Desde aquí se mide tu avance.`,
    why: "Es tu primera sesión de este ejercicio: todavía no hay con qué compararla.",
  }),
  new_best: (d) => ({
    title: "Tu mejor movimiento hasta ahora",
    text: `Llegaste a ${n(d.best)}°. Antes tu mejor era ${n(d.previous)}°.`,
    why: "Solo se destaca cuando la mejora supera el margen de error de la cámara (unos 4°), para no celebrar una diferencia que podría ser de la medición.",
  }),
  improving: (d) => ({
    title: "Vas mejorando",
    text: `En tus últimas ${d.sessions} sesiones pasaste de ${n(d.from)}° a ${n(d.to)}° (+${n(d.gain)}°). Sigue con la misma constancia.`,
    why: "Compara el inicio y el final de tus sesiones recientes; ignora los días sueltos.",
  }),
  close_to_target: (d) => ({
    title: "Ya casi llegas",
    text: `Te faltan ${n(d.remaining)}° para tu meta de ${n(d.target)}°. Sigue sin forzar el movimiento.`,
    why: "Estás mejorando y la distancia a la meta es de 10° o menos.",
  }),
  slow_down: (d) => ({
    title: "Ve más despacio",
    text: "Hoy hiciste el movimiento muy rápido. En tu próxima sesión cuenta mentalmente «uno, dos» al subir y «uno, dos» al bajar.",
    why: `${d.up != null ? `Subiste en ${n(d.up)} s` : ""}${d.up != null && d.down != null ? " y " : ""}${d.down != null ? `bajaste en ${n(d.down)} s` : ""}: menos de 0,6 s se considera poco controlado.`,
  }),
  hold_longer: (d) => ({
    title: "Sostén un poco más arriba",
    text: `Mantén el punto más lejano unos ${n(d.expected)} segundos (hoy sostuviste ${n(d.seconds)} s).`,
    why: `El ejercicio pide sostener ${n(d.expected)} s y en promedio sostuviste menos de la mitad.`,
  }),
  rest_between: (d) => ({
    title: "Descansa entre series",
    text: "Hacia el final tus movimientos fueron más cortos. Descansa un poco más entre series y cuéntale a tu fisioterapeuta si te cansas rápido.",
    why: `Tu recorrido bajó ${n(d.drop_pct)} % entre el principio y el final de la sesión (de ${n(d.first)}° a ${n(d.last)}°).`,
  }),
  posture_care: (d) => ({
    title: "Cuida tu postura",
    text: "Algunas repeticiones se hicieron moviendo el cuerpo para ayudarte (por ejemplo, el tronco). Mantenlo quieto y mira otra vez cómo se hace.",
    why: `${n(d.pct)} % de tus repeticiones tuvieron una alerta de postura.`,
  }),
  camera_setup: (d) => ({
    title: "Colócate mejor frente a la cámara",
    text: "La cámara no te vio bien en parte de la sesión. Aléjate un poco y que se vea toda la extremidad.",
    why: `Se vio tu articulación el ${n(d.pct)} % del tiempo. Con la persona más lejos o tapada, la medición pierde precisión.`,
  }),
  steady_rhythm: () => ({
    title: "Ritmo parejo",
    text: "Tu ritmo fue cambiando entre repeticiones. Intenta mantener la misma velocidad en todas.",
    why: "El tiempo de cada repetición varió bastante dentro de la sesión.",
  }),
  regression: (d) => ({
    title: "Hoy te moviste menos",
    text: "Tu mejor movimiento de hoy está por debajo de lo habitual. Puede ser cansancio o molestia. Si hay dolor o hinchazón, avísale a tu fisioterapeuta.",
    why: `Hoy llegaste a ${n(d.last)}° y en tus sesiones anteriores solías llegar a ~${n(d.usual)}°: una caída mayor al margen de error de la cámara.`,
  }),
  plateau: (d) => ({
    title: "Tu avance se frenó",
    text: `En tus últimas ${d.sessions} sesiones estás alrededor de ${n(d.level)}°. Es común que el avance se detenga a ratos. Cuéntaselo a tu fisioterapeuta para revisar tu plan.`,
    why: "En esas sesiones el movimiento no cambió más que el margen de error de la cámara (unos 4°) y todavía no llegas a tu meta.",
  }),
  low_adherence: (d) => ({
    title: "Retomar la constancia",
    text: `En las últimas 2 semanas hiciste ${d.done} ${pl(d.done, "sesión", "sesiones")} de unas ${d.expected} previstas. Elige una hora fija del día para tus ejercicios.`,
    why: "Los estudios sobre adherencia asocian la constancia con la recuperación; la baja adherencia se relaciona con poca autoeficacia y poca actividad previa. No demuestran que una aplicación la mejore.",
  }),
  repeated_fatigue: () => ({
    title: "Te cansas pronto",
    text: "En varias sesiones seguidas tus movimientos se acortaron al final. Cuéntaselo a tu fisioterapeuta para ajustar tus series.",
    why: "El recorrido bajó más de 15 % al final en al menos 2 de tus últimas 3 sesiones.",
  }),
};

const THERAPIST = {
  raise_target: (d) => ({
    title: "Subir la meta",
    text: d.protect
      ? `Alcanzó la meta (${n(d.target)}°) en ${d.streak} sesiones seguidas. Está en etapa de protección: no se propone mover la meta automáticamente; valore si corresponde avanzar de etapa.`
      : `Alcanzó la meta (${n(d.target)}°) en ${d.streak} sesiones seguidas. Se propone subirla a ${n(d.next)}° (+5°). Las metas son individuales: el rango normal varía con la edad y el sexo.`,
    label: `Meta ${n(d.target)}° → ${n(d.next)}°`,
  }),
  reduce_volume: (d) => ({
    title: "Menos repeticiones por serie",
    text: `El recorrido cayó al final de la sesión en ${d.of === 1 ? "la última sesión" : `al menos 2 de las últimas ${d.of} sesiones`}${d.drop_pct != null ? ` (última: −${n(d.drop_pct)} %)` : ""}. Se propone pasar de ${d.reps_per_set} a ${d.next} repeticiones por serie.`,
    label: `${d.reps_per_set} → ${d.next} repeticiones por serie`,
  }),
  plateau_review: (d) => ({
    title: "Avance estancado",
    text: `Sin mejora mayor al margen de error de la cámara (${n(d.noise)}°) en las últimas ${d.sessions} sesiones: alrededor de ${n(d.level)}° con meta ${n(d.target)}°. Conviene reevaluar dolor, rigidez, técnica y la propia medición.`,
  }),
  regression_review: (d) => ({
    title: "Retroceso",
    text: `Mejor flexión de ${n(d.last)}° frente a ~${n(d.usual)}° en las sesiones previas (caída mayor a ${n(d.drop)}°, por encima del margen de error). Contactar al paciente: dolor, hinchazón o técnica.`,
  }),
  low_adherence: (d) => ({
    title: "Baja adherencia",
    text: `Hizo ${d.done} ${pl(d.done, "sesión", "sesiones")} de unas ${d.expected} previstas en los últimos ${d.days} días. Conviene contactarlo: la literatura asocia la baja adherencia con barreras del paciente (autoeficacia, actividad previa).`,
  }),
  posture_recurrent: () => ({
    title: "Compensaciones recurrentes",
    text: "Alertas de postura en 30 % o más de las repeticiones en al menos 2 de las últimas 3 sesiones. Revise el movimiento en el replay y valore una cita presencial.",
  }),
  camera_recurrent: () => ({
    title: "Medición poco confiable",
    text: "La articulación se vio poco en varias sesiones seguidas. Revise con el paciente dónde coloca la cámara: la precisión baja al alejarse o al taparse.",
  }),
  tempo_recurrent: () => ({
    title: "Movimiento rápido recurrente",
    text: "Subidas o bajadas muy rápidas en varias sesiones seguidas. Indique un ritmo controlado.",
  }),
};

const GROUP_TONE = { highlights: "good", focus: "info", care: "warn" };

/** Texto de una recomendación. `audience`: "patient" | "therapist". Un código desconocido (motor más nuevo) no rompe la pantalla. */
export function coachText(item, audience, group = null) {
  const table = audience === "therapist" ? THERAPIST : PATIENT;
  const make = table[item?.code];
  const base = make ? make(item.data ?? {}) : { title: "Observación", text: String(item?.code ?? "") };
  const tone = audience === "therapist" ? (item?.severity === "warn" ? "warn" : "info") : GROUP_TONE[group] ?? "info";
  return { ...base, tone };
}

/** A dónde lleva el botón de una recomendación del paciente. `ctx` = { pid, libraryCode }. null si no hay acción. */
export function coachAction(item, ctx) {
  switch (item?.action?.type) {
    case "library": return ctx.libraryCode ? { label: "Ver cómo se hace", to: `/paciente/${ctx.pid}/aprender/${ctx.libraryCode}` } : null;
    case "setup": return { label: "Ver cómo colocarte", to: `/paciente/${ctx.pid}/aprender/edu_home_program` };
    case "pain": return { label: "Leer las señales de alerta", to: `/paciente/${ctx.pid}/aprender/edu_pain_swelling` };
    case "habit": return { label: "Consejos para la constancia", to: `/paciente/${ctx.pid}/aprender/edu_home_program` };
    case "contact": return null; // no hay a dónde ir: es hablar con su fisioterapeuta (el texto ya lo dice)
    default: return null;
  }
}

/** Nota clínica que deja constancia de que un ajuste vino del asistente y lo aprobó el fisioterapeuta. */
export function appliedNote(item, label) {
  const { text } = coachText(item, "therapist");
  return `Ajuste aplicado a sugerencia del asistente: ${label}. Motivo: ${text}`.slice(0, 2000);
}
