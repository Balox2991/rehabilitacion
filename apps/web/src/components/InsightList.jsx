import { orderedInsights } from "../lib/insights.js";
import Icon from "./Icon.jsx";

// Observaciones del análisis de una sesión. `audience`: "patient" (lenguaje llano) o "therapist" (cifras).
export default function InsightList({ suggestions, audience, limit }) {
  const items = orderedInsights(suggestions, audience, limit);
  if (items.length === 0) return null;
  return (
    <ul className="insights">
      {items.map((i) => {
        const tone = i.code === "well_done" ? "good" : i.tone;
        return (
          <li key={i.code} className={`insight is-${tone}`}>
            <span className="insight-icon" aria-hidden="true"><Icon name={tone === "good" ? "check" : tone === "warn" ? "alert" : "note"} size={18} /></span>
            <div>
              <strong>{i.title}</strong>
              <p>{i.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
