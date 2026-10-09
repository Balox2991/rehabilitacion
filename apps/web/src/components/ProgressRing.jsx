// Anillo de progreso (0–100). Decorativo pero con texto accesible.
export default function ProgressRing({ value, size = 132, stroke = 12, label }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Progreso"}: ${value == null ? "sin datos" : `${v}%`}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--blue-600)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="ring-center">
        <strong className="num">{value == null ? "—" : `${v}%`}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}
