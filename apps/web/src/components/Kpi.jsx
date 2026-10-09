// Indicador: qué es, su número y cómo leerlo. Lo usan el resumen del fisioterapeuta y el progreso del paciente.
export default function Kpi({ label, value, unit, hint }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value num">{value ?? "—"}{unit && value != null && <small>{unit}</small>}</strong>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}
