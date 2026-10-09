export function Loading({ rows = 3 }) {
  return (
    <div className="container page-pad" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ height: 40, width: "40%", marginBottom: 20 }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 120, marginBottom: 16 }} />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="container page-pad">
      <div className="notice notice-error" role="alert">
        <strong>No pudimos cargar esta pantalla.</strong>
        <p style={{ marginTop: 4 }}>{error?.message ?? "Error desconocido."}</p>
        {onRetry && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
