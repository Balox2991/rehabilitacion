import { useState } from "react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { EVIDENCE_TOPIC } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import EvidenceList from "../../components/EvidenceList.jsx";
import PageHeader from "../../components/PageHeader.jsx";

export default function Evidence() {
  const { data, error, loading, reload } = useAsync(() => api.evidence(), []);
  const [topic, setTopic] = useState("");
  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const shown = data.filter((e) => !topic || e.topic === topic);

  return (
    <div className="stack">
      <PageHeader
        title="Estudios que respaldan el diseño"
        description={`${data.length} referencias verificadas contra PubMed y arXiv. Dan contexto a la telerrehabilitación, a la rehabilitación de fracturas y a la medición con cámara.`}
      />

      <div className="notice notice-info">
        <strong>Qué respaldan y qué no.</strong> Ninguno de estos estudios evalúa esta aplicación. Respaldan el contexto clínico y
        técnico de las decisiones de diseño; no demuestran que el sistema mejore la recuperación ni que mida sin error. Esa
        validación clínica queda como trabajo futuro.
      </div>

      <div className="chips" role="group" aria-label="Filtrar por tema">
        <button className={`chip ${topic === "" ? "is-on" : ""}`} aria-pressed={topic === ""} onClick={() => setTopic("")}>Todos <span className="num">{data.length}</span></button>
        {Object.entries(EVIDENCE_TOPIC).map(([k, label]) => (
          <button key={k} className={`chip ${topic === k ? "is-on" : ""}`} aria-pressed={topic === k} onClick={() => setTopic(k)}>
            {label} <span className="num">{data.filter((e) => e.topic === k).length}</span>
          </button>
        ))}
      </div>
      <EvidenceList items={shown} showTopic />
    </div>
  );
}
