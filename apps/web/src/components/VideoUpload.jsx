import { useRef, useState } from "react";
import { bodyPartOf } from "../lib/exercise.js";
import { saveSessionSafely } from "../lib/saveSession.js";
import { buildSessionPayload } from "../lib/sessionPayload.js";
import { MAX_VIDEO_SECONDS, VideoError, analyzeVideoFile } from "../tracking/videoAnalysis.js";
import Icon from "./Icon.jsx";

const MIN_SEEN = 0.25; // fracción mínima de cuadros donde se vio la articulación

// «Tengo un video grabado»: el paciente elige un video de su celular, el navegador lo analiza (el archivo NO se sube) y se
// guarda la sesión con el mismo análisis que una sesión en vivo.
export default function VideoUpload({ pid, plan, exercise, onSaved, onBack }) {
  const [state, setState] = useState({ status: "idle", progress: 0, message: "" });
  const stop = useRef(false);
  const input = useRef(null);
  const working = state.status === "working";

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite elegir el mismo archivo otra vez después de un error
    if (!file) return;
    stop.current = false;
    setState({ status: "working", progress: 0, message: "Abriendo el video…" });
    try {
      const r = await analyzeVideoFile(file, {
        exercise, side: plan.side, targetAngle: plan.target_angle,
        onProgress: (f) => setState((s) => (s.status === "working" ? { ...s, progress: f, message: "Analizando tu movimiento…" } : s)),
        shouldStop: () => stop.current,
      });
      if (r.cancelled) return setState({ status: "idle", progress: 0, message: "" });
      if (r.total === 0 || r.seen / r.total < MIN_SEEN) {
        throw new VideoError(`No pudimos ver tu ${bodyPartOf(exercise)} en el video. Graba de perfil, de cuerpo completo y con buena luz, y vuelve a intentarlo.`);
      }
      const end = new Date();
      const { body, analysis } = buildSessionPayload({
        plan, snap: { started_at: new Date(end.getTime() - r.seconds * 1000), ended_at: end, reps: [] }, trace: r.trace,
      });
      if (!analysis || analysis.summary.count === 0) {
        throw new VideoError("No detectamos repeticiones en el video. Haz el movimiento completo (de reposo hasta lo más lejos que llegues y de vuelta) y que se vea toda la extremidad.");
      }
      setState({ status: "working", progress: 1, message: "Guardando tu sesión…" });
      onSaved(await saveSessionSafely(pid, body));
    } catch (err) {
      setState({ status: "error", progress: 0, message: err instanceof VideoError ? err.message : `No se pudo analizar el video: ${err?.message ?? err}` });
    }
  }

  return (
    <section className="card panel video-upload" aria-labelledby="h-upload">
      <div className="panel-head">
        <h2 id="h-upload">Sube un video de tu serie</h2>
        <p>Grábate con tu celular haciendo el ejercicio y elige el video aquí. <strong>El video no se sube a internet:</strong> se analiza en tu propio navegador y solo se guardan los ángulos y un esquema de tu cuerpo.</p>
      </div>
      <ul className="video-tips">
        <li>De perfil a la cámara y de cuerpo completo, con buena luz y un fondo despejado.</li>
        <li>Con la cámara trasera del celular: la frontal puede invertir izquierda y derecha.</li>
        <li>Empieza en reposo, haz tus repeticiones completas y no cortes el final. Hasta {MAX_VIDEO_SECONDS / 60} minutos.</li>
      </ul>

      {working ? (
        <div className="video-progress" role="status">
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)} aria-label="Progreso del análisis"><span style={{ width: `${Math.round(state.progress * 100)}%` }} /></div>
          <p>{state.message} <span className="num">{Math.round(state.progress * 100)} %</span></p>
          {state.progress < 1 && <button type="button" className="btn btn-ghost" onClick={() => { stop.current = true; }}>Cancelar</button>}
        </div>
      ) : (
        <div className="flow-actions">
          <input ref={input} type="file" accept="video/*" className="sr-only" id="video-file" onChange={onFile} />
          <label htmlFor="video-file" className="btn btn-primary btn-lg"><Icon name="video" size={18} /> Elegir un video</label>
          <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>Volver</button>
        </div>
      )}
      {state.status === "error" && <p className="notice notice-error" role="alert">{state.message}</p>}
    </section>
  );
}
