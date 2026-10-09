// Textos del análisis de una sesión (probados en tests/insights.test.mjs).
// El motor (analysis.js) devuelve CÓDIGOS con sus números: `{ code, severity, data }`. Aquí se convierten en frases, y
// la misma observación se dice distinto según quién la lee:
//   - paciente: lenguaje llano, sin culpar, con una acción posible. Nunca diagnostica.
//   - fisioterapeuta: técnico y con las cifras.
// Las observaciones son orientativas (umbrales en analysis.js → THRESHOLDS), no criterio clínico.

const n = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10).replace(".", ","));

const TEXTS = {
  low_visibility: {
    patient: (d) => ({ title: "Cámara", text: `La cámara no te vio bien durante parte de la sesión (se vio ${n(d.pct)} % del tiempo). La próxima vez aléjate un poco y que se vea toda la extremidad.` }),
    therapist: (d) => ({ title: "Visibilidad", text: `La articulación se vio ${n(d.pct)} % del tiempo: la medición pierde confiabilidad. Conviene revisar el encuadre con el paciente.` }),
  },
  no_reps: {
    patient: () => ({ title: "Repeticiones", text: "No pudimos contar repeticiones en esta sesión. Revisa que se vea toda la extremidad y que el movimiento sea amplio." }),
    therapist: () => ({ title: "Repeticiones", text: "No se detectaron repeticiones válidas en el registro." }),
  },
  interrupted: {
    patient: (d) => ({ title: "Cámara", text: `En ${d.count} ${d.count === 1 ? "repetición" : "repeticiones"} la cámara perdió tu articulación y no se ${d.count === 1 ? "contó" : "contaron"}.` }),
    therapist: (d) => ({ title: "Repeticiones descartadas", text: `${d.count} ${d.count === 1 ? "repetición descartada" : "repeticiones descartadas"} porque la articulación salió de la vista durante el movimiento.` }),
  },
  incomplete: {
    patient: (d) => ({ title: "Tu plan", text: `Hiciste ${d.done} de ${d.expected} repeticiones de tu plan. Si algo te dolió o te cansaste, está bien parar: cuéntaselo a tu fisioterapeuta.` }),
    therapist: (d) => ({ title: "Volumen", text: `Completó ${d.done} de ${d.expected} repeticiones prescritas.` }),
  },
  target_not_reached: {
    patient: (d) => ({ title: "Tu meta", text: `Todavía no llegas a tu meta de ${n(d.target)}° (tu mejor movimiento fue de ${n(d.best)}°). Es normal: el movimiento se recupera de a poco. Sigue sin forzar.` }),
    therapist: (d) => ({ title: "Meta", text: `Ninguna repetición alcanzó la meta (${n(d.target)}° de flexión). Mejor repetición: ${n(d.best)}°.` }),
  },
  fatigue: {
    patient: (d) => ({ title: "Cansancio", text: `Tus últimas repeticiones fueron más cortas que las primeras (bajó ${n(d.drop_pct)} %). Puede ser cansancio: descansa un poco entre series.` }),
    therapist: (d) => ({ title: "Posible fatiga", text: `El ROM cayó ${n(d.drop_pct)} % entre el primer tercio (${n(d.first)}°) y el último (${n(d.last)}°) de la sesión.` }),
  },
  fast_up: {
    patient: () => ({ title: "Velocidad", text: "Subes muy rápido. Intenta hacerlo más despacio y controlado: así trabaja mejor la articulación." }),
    therapist: (d) => ({ title: "Subida rápida", text: `Subida promedio de ${n(d.seconds)} s (del 10 al 90 % del recorrido): movimiento poco controlado.` }),
  },
  fast_down: {
    patient: () => ({ title: "Velocidad", text: "Bajas muy rápido. Intenta volver al inicio despacio, sin dejar caer la pierna o el brazo." }),
    therapist: (d) => ({ title: "Bajada rápida", text: `Bajada promedio de ${n(d.seconds)} s: posible descenso sin control.` }),
  },
  short_hold: {
    patient: (d) => ({ title: "Pausa arriba", text: `Sostén el movimiento arriba unos ${n(d.expected)} segundos (en promedio sostuviste ${n(d.seconds)} s).` }),
    therapist: (d) => ({ title: "Sostén corto", text: `Sostén promedio de ${n(d.seconds)} s frente a ${n(d.expected)} s prescritos.` }),
  },
  irregular_rhythm: {
    patient: () => ({ title: "Ritmo", text: "Tu ritmo fue cambiando entre repeticiones. Intenta mantener un ritmo parejo." }),
    therapist: (d) => ({ title: "Ritmo irregular", text: `Variación del ritmo entre repeticiones de ${n(d.cv_pct)} %.` }),
  },
  posture: {
    patient: (d) => ({ title: "Postura", text: `En ${n(d.pct)} % de tus repeticiones la postura necesitaba corrección (por ejemplo, el tronco). Procura mantener el cuerpo quieto.` }),
    therapist: (d) => ({ title: "Postura", text: `${n(d.pct)} % de las repeticiones con alerta de postura (compensación).` }),
  },
  well_done: {
    patient: () => ({ title: "¡Bien hecho!", text: "Sesión pareja y controlada. Sigue así." }),
    therapist: () => ({ title: "Sin observaciones", text: "Sesión pareja y controlada, sin alertas del análisis." }),
  },
};

/** Texto de una observación para el paciente o el fisioterapeuta. Un código desconocido no rompe la pantalla (versión nueva del motor). */
export function insightText(suggestion, audience) {
  const entry = TEXTS[suggestion?.code]?.[audience];
  const base = entry ? entry(suggestion.data ?? {}) : { title: "Observación", text: String(suggestion?.code ?? "") };
  return { ...base, tone: suggestion?.severity === "warn" ? "warn" : "info" };
}

/** Las observaciones ordenadas: primero las de atención y, entre iguales, el orden en que las dio el motor. */
export function orderedInsights(suggestions, audience, limit = Infinity) {
  const ranked = [...(suggestions ?? [])].map((s, i) => ({ s, i })).sort((a, b) => (a.s.severity === "warn" ? 0 : 1) - (b.s.severity === "warn" ? 0 : 1) || a.i - b.i);
  return ranked.slice(0, limit).map(({ s }) => ({ code: s.code, ...insightText(s, audience) }));
}

/**
 * Datos para el gráfico de barras «una barra por repetición»: altura = flexión alcanzada; marca = meta; aviso = alerta de postura.
 * @returns {{bars:{n:number,flexion:number,reached:boolean,flagged:boolean}[], max:number, target:number|null}}
 */
export function repBarsModel(analysis, targetFlexion = null) {
  const bars = (analysis?.reps ?? []).map((r) => ({ n: r.n, flexion: r.flexion, reached: r.reached_target, flagged: r.flags.length > 0 }));
  const peak = Math.max(0, ...bars.map((b) => b.flexion), targetFlexion ?? 0);
  return { bars, max: Math.max(10, Math.ceil((peak * 1.1) / 10) * 10), target: targetFlexion };
}
