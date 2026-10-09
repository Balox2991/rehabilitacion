// Contenedor común de las pantallas del paciente: ancho de lectura cómodo y el mismo ritmo vertical (.stack) en todas.
// `.area-patient` identifica el área (acciones en coral, fondo cálido); `className="overlap"` hace que el contenido suba sobre la portada.
export default function PatientPage({ children, className = "" }) {
  return (
    <div className={`area-patient ${className}`}>
      <div className="container patient-page">
        <div className="stack">{children}</div>
      </div>
    </div>
  );
}
