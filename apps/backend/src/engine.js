// Motor de análisis compartido con el navegador (vive en apps/tracking-prototype/src; JavaScript puro, sin DOM).
// Así el servidor ejecuta EXACTAMENTE el mismo análisis que ve el paciente y puede rehacerlo con una versión nueva.
export { ANALYZER_VERSION, TRACE_FORMAT, analyzeSession } from "../../tracking-prototype/src/analysis.js";
export { SKELETON_JOINTS } from "../../tracking-prototype/src/traceRecorder.js";
export { SPECS, validateSpec } from "../../tracking-prototype/src/exerciseSpecs.js";
export { COACH, coach } from "../../tracking-prototype/src/coach.js";
