import { useCallback, useState } from "react";

// Diferencia entre lo que hay en el formulario y lo último guardado: solo se envía lo que cambió.
// "" y null cuentan como lo mismo (campo vacío). Función pura, probada en tests/form.test.mjs.
export function diffValues(values, base) {
  const changed = {};
  for (const key of Object.keys(values)) {
    if ((values[key] ?? "") !== (base[key] ?? "")) changed[key] = values[key];
  }
  return changed;
}

// Estado de UNA sección editable de un formulario (identificación, contacto, salud, ajustes…): valores, si hay
// cambios sin guardar, guardado en curso, error y confirmación. Cada sección se guarda por separado.
//   save(cambios, valores) debe lanzar un Error con mensaje legible si el servidor rechaza los datos.
//   Puede devolver { values } con lo que el servidor dejó guardado ya normalizado (p. ej. el celular sin espacios):
//   el formulario pasa a mostrar eso. Así no hace falta recrear la sección al guardar, y los cambios sin guardar
//   de OTRAS secciones no se pierden.
export function useSectionForm(initial, save) {
  const [values, setValues] = useState(initial);
  const [base, setBase] = useState(initial);
  const [status, setStatus] = useState({ saving: false, error: "", saved: false });

  const changes = diffValues(values, base);
  const dirty = Object.keys(changes).length > 0;

  const set = useCallback((key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setValues((v) => ({ ...v, [key]: value }));
    setStatus((s) => (s.saved ? { ...s, saved: false } : s));
  }, []);

  const submit = useCallback(
    async (e) => {
      e?.preventDefault();
      if (!Object.keys(diffValues(values, base)).length) return;
      setStatus({ saving: true, error: "", saved: false });
      try {
        const result = await save(diffValues(values, base), values);
        const next = result?.values ?? values;
        setValues(next);
        setBase(next);
        setStatus({ saving: false, error: "", saved: true });
      } catch (err) {
        setStatus({ saving: false, error: err.message, saved: false });
      }
    },
    [values, base, save]
  );

  const reset = useCallback(() => {
    setValues(base);
    setStatus({ saving: false, error: "", saved: false });
  }, [base]);

  // Vuelve a cargar el formulario con valores nuevos (p. ej. tras «restablecer valores por defecto»).
  const replace = useCallback((next) => {
    setValues(next);
    setBase(next);
    setStatus({ saving: false, error: "", saved: true });
  }, []);

  return { values, set, dirty, submit, reset, replace, ...status };
}
