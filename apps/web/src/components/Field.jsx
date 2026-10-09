import { cloneElement, useId } from "react";

// Campo de formulario accesible: etiqueta enlazada al control, ayuda opcional y el mismo espaciado en todos lados.
// `children` es UN solo control (input, select, textarea); Field le pone el id.
export default function Field({ label, hint, wide = false, children }) {
  const id = useId();
  return (
    <div className={`field ${wide ? "field-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, "aria-describedby": hint ? `${id}-hint` : undefined })}
      {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

// Pie común de una sección editable: guardar, descartar y el resultado, con el mismo comportamiento en todas.
export function FormFooter({ form, saveLabel = "Guardar cambios" }) {
  return (
    <div className="form-footer">
      <div className="form-footer-buttons">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!form.dirty || form.saving}>{form.saving ? "Guardando…" : saveLabel}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={form.reset} disabled={!form.dirty || form.saving}>Descartar</button>
      </div>
      <p className="form-status" role="status">
        {form.saved && !form.dirty && <span className="form-ok">Cambios guardados</span>}
        {form.dirty && !form.saving && <span className="form-pending">Tienes cambios sin guardar</span>}
      </p>
      {form.error && <p className="notice notice-error form-error" role="alert">{form.error}</p>}
    </div>
  );
}
