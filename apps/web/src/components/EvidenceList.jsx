import { EVIDENCE_KIND, EVIDENCE_TOPIC, evidenceId } from "../lib/labels.js";
import Icon from "./Icon.jsx";

// Referencias con lo que encontraron Y lo que NO demuestran. Cada estudio se verificó contra PubMed o arXiv.
export default function EvidenceList({ items, showTopic = false }) {
  if (!items.length) return null;
  return (
    <ul className="evidence-list">
      {items.map((e) => (
        <li key={e.code} className="evidence-item">
          <div className="evidence-meta">
            <span className={`kind kind-${e.kind}`}>{EVIDENCE_KIND[e.kind]}</span>
            {showTopic && <span className="pill pill-mute">{EVIDENCE_TOPIC[e.topic]}</span>}
            <span className="num evidence-year">{e.year}</span>
          </div>
          <h4>{e.title}</h4>
          <p className="evidence-cite">{e.authors.length > 90 ? `${e.authors.split(",").slice(0, 3).join(",")} et al.` : e.authors} · {e.source}</p>
          <p>{e.summary}</p>
          <details>
            <summary>Qué no demuestra</summary>
            <p className="evidence-limit">{e.limitation}</p>
          </details>
          <a href={e.url} target="_blank" rel="noopener noreferrer" className="evidence-link">
            {evidenceId(e)} <Icon name="external" size={14} />
          </a>
        </li>
      ))}
    </ul>
  );
}
