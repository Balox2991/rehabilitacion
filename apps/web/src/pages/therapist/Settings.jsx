import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { useSectionForm } from "../../lib/useSectionForm.js";
import { DEFAULT_SETTINGS, settingsToValues, toSettingsPayload } from "../../lib/settings.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Field, { FormFooter } from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";

// Normas colombianas relevantes para una aplicación de telerrehabilitación. Cada enlace es a la fuente oficial.
// Es ORIENTACIÓN para el proyecto, no asesoría jurídica.
const NORMS = [
  { name: "Ley 1581 de 2012", what: "Protección de datos personales. Los datos de salud son sensibles: solo se tratan con autorización previa, expresa e informada del paciente.", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981" },
  { name: "Resolución 1995 de 1999", what: "Manejo de la historia clínica: custodia, confidencialidad y conservación. Los plazos de retención fueron modificados por la Resolución 839 de 2017.", url: "https://www.minsalud.gov.co/normatividad_nuevo/resoluci%C3%93n%201995%20de%201999.pdf" },
  { name: "Resolución 839 de 2017", what: "Modifica la Resolución 1995 de 1999 en lo relativo a la historia clínica y su conservación.", url: "https://www.minsalud.gov.co/Normatividad_Nuevo/Resolucion%20No%20839%20de%202017.pdf" },
  { name: "Resolución 2654 de 2019", what: "Telesalud y parámetros para la práctica de la telemedicina: uso de medios tecnológicos, calidad, seguridad de la información y consentimiento informado.", url: "https://www.minsalud.gov.co/normatividad_nuevo/resoluci%C3%B3n%20no.%202654%20del%202019.pdf" },
  { name: "Ley 528 de 1999", what: "Ejercicio de la fisioterapia y ética profesional. Quien ejerce necesita tarjeta profesional del Consejo Profesional Nacional de Fisioterapia.", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=66199" },
  { name: "Ley 2015 de 2020", what: "Historia clínica electrónica interoperable: a futuro, la información clínica deberá poder intercambiarse entre prestadores.", url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=105472" },
];

export default function Settings() {
  const { tid } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.settings(tid), [tid]);
  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <SettingsForm tid={tid} initial={data} />;
}

function SettingsForm({ tid, initial }) {
  const [restoreError, setRestoreError] = useState("");
  const form = useSectionForm(settingsToValues(initial), async (_changes, values) => {
    const payload = toSettingsPayload(values);
    if (!payload) throw new Error("Escribe números enteros en los dos campos.");
    return { values: settingsToValues(await api.saveSettings(tid, payload)) };
  });
  const isDefault = toSettingsPayload(form.values) && Object.entries(DEFAULT_SETTINGS).every(([k, v]) => Number(form.values[k]) === v);

  async function restore() {
    setRestoreError("");
    try {
      form.replace(settingsToValues(await api.saveSettings(tid, DEFAULT_SETTINGS)));
    } catch (err) {
      setRestoreError(err.message);
    }
  }

  return (
    <div className="page-inner stack">
      <PageHeader title="Configuración" description="Ajusta cuándo el panel te avisa que un paciente necesita atención." />

      <form className="card panel form-panel" onSubmit={form.submit}>
        <div className="panel-head"><div><h2>Alertas del panel</h2><p>Estos umbrales son un punto de partida, no un criterio clínico: ajústalos a tu forma de trabajar. Se aplican a todos tus pacientes.</p></div></div>
        <div className="form-grid">
          <Field label="Días sin sesión para avisar" hint={`Un paciente con plan que pasa ${form.values.inactivity_days || "N"} días o más sin hacer sus ejercicios aparece como «Sin actividad».`}>
            <input type="number" inputMode="numeric" min="1" max="60" step="1" value={form.values.inactivity_days} onChange={form.set("inactivity_days")} />
          </Field>
          <Field label="% de repeticiones con alerta de postura" hint={`Si ${form.values.compensation_alert_pct || "N"} % o más de las repeticiones de los últimos 30 días tuvieron una alerta de postura, aparece como «Compensaciones».`}>
            <input type="number" inputMode="numeric" min="5" max="100" step="1" value={form.values.compensation_alert_pct} onChange={form.set("compensation_alert_pct")} />
          </Field>
        </div>
        <FormFooter form={form} />
        <div className="form-footer-buttons">
          <button type="button" className="btn btn-ghost btn-sm" onClick={restore} disabled={isDefault && !form.dirty}>Restablecer valores por defecto</button>
        </div>
        {restoreError && <p className="notice notice-error" role="alert">{restoreError}</p>}
      </form>

      <section className="card panel" aria-labelledby="h-norm">
        <div className="panel-head"><div><h2 id="h-norm"><Icon name="shield" size={18} /> Marco normativo colombiano</h2><p>Normas que conviene conocer al usar una aplicación como esta con pacientes reales.</p></div></div>
        <ul className="norm-list">
          {NORMS.map((n) => (
            <li key={n.name}>
              <a href={n.url} target="_blank" rel="noopener noreferrer"><strong>{n.name}</strong> <Icon name="external" size={13} /></a>
              <p>{n.what}</p>
            </li>
          ))}
        </ul>
        <p className="notice notice-info">Es orientación para el proyecto, no asesoría jurídica. Antes de operar con pacientes reales, valida con un abogado en salud cómo aplican estas normas a tu caso. Esta aplicación es un complemento de seguimiento y <strong>no reemplaza la historia clínica</strong> de la clínica.</p>
      </section>
    </div>
  );
}
