import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAsync } from "../lib/useAsync.js";
import { LIMBS, buildReplayModel, poseAt } from "../lib/replayModel.js";
import { ErrorState } from "./PageState.jsx";
import Icon from "./Icon.jsx";

const SPEEDS = [0.5, 1, 2];
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Reproduce el movimiento de la sesión como un «muñeco» (esqueleto) con el ángulo medido: el fisioterapeuta revisa la
// técnica SIN ver a la persona, porque el registro no guarda video ni imágenes. Vista de la cámara (sin espejo).
export default function SkeletonReplay({ sessionId, analysis }) {
  const { data: trace, error, loading, reload } = useAsync(() => api.sessionTrace(sessionId), [sessionId]);
  if (loading) return <div className="skeleton" style={{ height: 320 }} aria-busy="true" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Player trace={trace} analysis={analysis} />;
}

function Player({ trace, analysis }) {
  const model = useMemo(() => buildReplayModel(trace, analysis), [trace, analysis]);
  const end = model.t0 + model.duration;
  const [pos, setPos] = useState(model.t0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const posRef = useRef(model.t0);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      posRef.current = Math.min(end, posRef.current + (now - last) * speed);
      last = now;
      setPos(posRef.current);
      if (posRef.current >= end) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  function seek(ms) {
    posRef.current = ms;
    setPos(ms);
  }
  function togglePlay() {
    if (!playing && posRef.current >= end) seek(model.t0); // al terminar, «Reproducir» vuelve a empezar
    setPlaying((p) => !p);
  }

  const pose = poseAt(model, pos);
  const [a, b, c] = model.measured;
  const vertex = pose.points[b];
  const pct = (ms) => (model.duration ? ((ms - model.t0) / model.duration) * 100 : 0);

  return (
    <div className="replay">
      <div className="replay-stage">
        {pose.hasSkeleton ? (
          <svg viewBox={`0 0 ${model.width} ${model.height}`} role="img" aria-label="Muñeco con el movimiento de la sesión" className={pose.visible ? "" : "is-hidden"}>
            <rect width={model.width} height={model.height} className="rp-bg" />
            {LIMBS.map(([p, q]) => pose.points[p] && pose.points[q] && (
              <line key={`${p}-${q}`} x1={pose.points[p].x} y1={pose.points[p].y} x2={pose.points[q].x} y2={pose.points[q].y} className="rp-limb" />
            ))}
            {[[a, b], [b, c]].map(([p, q]) => pose.points[p] && pose.points[q] && (
              <line key={`m-${p}-${q}`} x1={pose.points[p].x} y1={pose.points[p].y} x2={pose.points[q].x} y2={pose.points[q].y} className="rp-measured" />
            ))}
            {Object.entries(pose.points).map(([name, p]) => <circle key={name} cx={p.x} cy={p.y} r={model.measured.includes(name) ? 8 : 5} className={model.measured.includes(name) ? "rp-joint is-measured" : "rp-joint"} />)}
            {vertex && pose.flexion != null && (
              <g transform={`translate(${vertex.x + 16} ${vertex.y - 10})`}>
                <rect x="0" y="-22" width="74" height="30" rx="8" className="rp-tag" />
                <text x="37" y="0" textAnchor="middle" className="rp-tag-text">{Math.round(pose.flexion)}°</text>
              </g>
            )}
          </svg>
        ) : (
          <p className="replay-empty">Esta sesión no guardó el esqueleto (el registro era demasiado grande). Las estadísticas sí están completas.</p>
        )}
        {pose.hasSkeleton && !pose.visible && <span className="replay-badge">Sin ver la articulación</span>}
      </div>

      <div className="replay-bar">
        <button type="button" className="btn btn-primary btn-sm replay-play" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproducir"}>
          <Icon name={playing ? "pause" : "play"} size={16} /> {playing ? "Pausar" : "Reproducir"}
        </button>
        <label className="replay-speed">Velocidad
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s === 0.5 ? "0,5×" : `${s}×`}</option>)}
          </select>
        </label>
        <span className="replay-time num" aria-live="off">
          {clock(pos - model.t0)} / {clock(model.duration)}
          {pose.rep != null && <> · Repetición {pose.rep}</>}
          {pose.flexion != null && <> · {Math.round(pose.flexion)}°</>}
        </span>
      </div>

      <div className="replay-timeline">
        <input type="range" min={model.t0} max={end} step={10} value={pos} onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }} aria-label="Posición en la sesión" />
        {model.reps.map((r) => <i key={r.n} className="replay-tick" style={{ left: `${pct(r.peak)}%` }} aria-hidden="true" />)}
      </div>

      {model.reps.length > 0 && (
        <div className="replay-reps" role="group" aria-label="Ir a una repetición">
          {model.reps.map((r) => (
            <button key={r.n} type="button" className={`chip ${pose.rep === r.n ? "is-on" : ""}`} onClick={() => { setPlaying(false); seek(r.from); }}>#{r.n}</button>
          ))}
        </div>
      )}
      <p className="replay-note">Vista de la cámara. Es un esquema del cuerpo: el registro no guarda video ni imágenes de la persona.</p>
    </div>
  );
}
