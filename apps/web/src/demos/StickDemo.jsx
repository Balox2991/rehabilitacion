import { useEffect, useRef, useState } from "react";
import { DEMOS, arcGeometry } from "./demos.js";

const PERIOD_MS = 3400;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Bones({ frame, ghost = false }) {
  return (
    <g className={ghost ? "demo-ghost" : ""}>
      {frame.bones.map((b, i) => (
        <line key={i} x1={b.a.x} y1={b.a.y} x2={b.b.x} y2={b.b.y} className={b.role === "move" ? "demo-bone" : "demo-bone-still"} />
      ))}
    </g>
  );
}

// Demostración animada de un ejercicio. Si el ejercicio se mide con cámara, `target` (ángulo objetivo del plan)
// fija el punto final de la animación y se dibuja una silueta punteada de la meta.
export default function StickDemo({ demo, target, compact = false, autoPlay = true, className = "" }) {
  const def = DEMOS[demo];
  const [v0, v1] = def ? def.range(target) : [0, 0];
  const [playing, setPlaying] = useState(autoPlay && !prefersReducedMotion());
  const [visible, setVisible] = useState(true);
  const [u, setU] = useState(1); // 0 = pose inicial, 1 = pose final
  const box = useRef(null);
  const started = useRef(0);

  // Solo anima cuando está a la vista: en una cuadrícula con varias demos no se gasta CPU fuera de pantalla.
  useEffect(() => {
    if (!box.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || !def) return;
    let raf = 0;
    let last = 0;
    started.current = performance.now() - (Math.acos(1 - 2 * u) / (2 * Math.PI)) * PERIOD_MS; // continúa donde iba
    const tick = (now) => {
      if (now - last > 33) {
        last = now;
        setU(0.5 - 0.5 * Math.cos(((now - started.current) / PERIOD_MS) * 2 * Math.PI));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, visible, def]);

  if (!def) return null;
  const frame = def.frame(v0 + (v1 - v0) * u);
  const ghost = def.tracked && target != null ? def.frame(v1) : null;
  const arc = frame.arc ? arcGeometry(frame.arc) : null;

  return (
    <div ref={box} className={`demo ${compact ? "demo-compact" : ""} ${className}`}>
      <svg viewBox="0 0 320 220" role="img" aria-label={`Demostración animada: ${def.title}`}>
        {frame.furniture.map((f, i) => <line key={i} x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} className="demo-furn" />)}
        {ghost && <Bones frame={ghost} ghost />}
        {frame.head && <circle cx={frame.head.x} cy={frame.head.y} r="13" className="demo-head" />}
        <Bones frame={frame} />
        {frame.joints.map((j, i) => <circle key={i} cx={j.x} cy={j.y} r="5.5" className="demo-joint" />)}
        {arc && !compact && (
          <>
            <path d={arc.d} className="demo-arc" />
          </>
        )}
      </svg>
      {!compact && <span className="demo-label">{frame.label}</span>}
      {!compact && ghost && <span className="demo-target">Línea punteada: tu meta ({target}°)</span>}
      {!compact && frame.note && <span className="demo-note">{frame.note}</span>}
      {!compact && (
        <button type="button" className="demo-toggle" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} aria-label={playing ? "Pausar la demostración" : "Reproducir la demostración"}>
          {playing ? "Pausar" : "Reproducir"}
        </button>
      )}
    </div>
  );
}
