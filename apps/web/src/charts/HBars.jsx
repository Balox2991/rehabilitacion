// Barras horizontales simples (sin librería): etiqueta, barra proporcional y conteo.
export default function HBars({ items, emptyText, tone = "warn" }) {
  if (!items.length) return <p className="chart-empty">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.flag}>
          <div className="hbars-row">
            <span>{i.flag}</span>
            <strong className="num">{i.count}</strong>
          </div>
          <div className={`meter ${tone === "warn" ? "is-warn" : ""}`} aria-hidden="true">
            <span style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
