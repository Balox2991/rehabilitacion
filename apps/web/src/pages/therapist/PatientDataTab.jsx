import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { useSectionForm } from "../../lib/useSectionForm.js";
import { resizeToJpeg } from "../../lib/image.js";
import { CIE10_SUGGESTIONS, DOCUMENT_TYPES, SIDE_LABEL, formatDateCo } from "../../lib/colombia.js";
import { PHASES, PHASE_ORDER } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import Avatar from "../../components/Avatar.jsx";
import Field, { FormFooter } from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";

const LAW_1581 = "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981";

// Valores iniciales de un formulario: null → "" para que los inputs sean siempre controlados.
const pick = (src, keys) => Object.fromEntries(keys.map((k) => [k, src[k] ?? ""]));

// Una sección editable con su propio guardado. `keys` = campos que edita; se envía SOLO lo que cambió.
function Section({ title, description, patient, keys, onSaved, children }) {
  const form = useSectionForm(pick(patient, keys), async (changes) => {
    // Los campos vacíos se mandan como null (borrar el dato).
    const body = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v === "" ? null : v]));
    const updated = await api.updatePatient(patient.id, body);
    onSaved();
    return { values: pick(updated, keys) };
  });
  return (
    <form className="card panel form-panel" onSubmit={form.submit}>
      <div className="panel-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>
      <div className="form-grid">{children(form)}</div>
      <FormFooter form={form} />
    </form>
  );
}

// Foto del paciente: se elige, se recorta cuadrada y se reduce EN EL NAVEGADOR, y solo entonces se sube.
function PhotoCard({ patient, onSaved }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await api.uploadPhoto(patient.id, await resizeToJpeg(file));
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.deletePhoto(patient.id);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card panel photo-panel" aria-labelledby="h-foto">
      <Avatar patient={patient} size="xl" />
      <div className="photo-text">
        <h2 id="h-foto">Foto del paciente</h2>
        <p>Opcional. Se recorta en cuadrado y se reduce en tu computador antes de subirla; el video de los ejercicios nunca se guarda.</p>
        <div className="form-footer-buttons">
          <input ref={input} type="file" accept="image/*" onChange={onFile} hidden />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()} disabled={busy}><Icon name="camera" size={16} /> {patient.has_photo ? "Cambiar foto" : "Subir foto"}</button>
          {patient.has_photo && <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={remove} disabled={busy}><Icon name="trash" size={15} /> Quitar</button>}
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

// Autorización para tratar datos personales (Ley 1581 de 2012): los datos de salud son «sensibles».
function ConsentCard({ patient, tid, onSaved }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const granted = Boolean(patient.data_consent_at);

  async function change(value) {
    setBusy(true);
    setError("");
    try {
      await api.setConsent(patient.id, value, Number(tid));
      setAsking(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card panel consent ${granted ? "" : "consent-pending"}`} aria-labelledby="h-consent">
      <div className="consent-head">
        <span className={`pill ${granted ? "pill-ok" : "pill-warn"}`}>{granted ? "Autorización registrada" : "Autorización pendiente"}</span>
        <h2 id="h-consent"><Icon name="shield" size={18} /> Tratamiento de datos personales</h2>
      </div>
      <p>
        Los datos de salud son <strong>datos sensibles</strong> (Ley 1581 de 2012): se tratan solo con autorización previa, expresa e informada del paciente,
        que debe poder consultarse después. Registra aquí que recibiste la autorización firmada.{" "}
        <a href={LAW_1581} target="_blank" rel="noopener noreferrer">Ver la ley <Icon name="external" size={13} /></a>
      </p>
      {granted ? (
        <p className="consent-when">Registrada el <strong>{formatDateCo(patient.data_consent_at)}</strong>{patient.data_consent_by_name && <> por <strong>{patient.data_consent_by_name}</strong></>}.</p>
      ) : (
        <p className="consent-when">Aún no hay una autorización registrada para este paciente.</p>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="form-footer-buttons">
        {granted ? (
          asking ? (
            <span className="confirm">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => change(false)} disabled={busy}>Sí, revocar</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setAsking(true)}>Registrar revocación</button>
          )
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => change(true)} disabled={busy}>{busy ? "Guardando…" : "Registrar autorización recibida"}</button>
        )}
      </div>
    </section>
  );
}

export default function PatientDataTab() {
  const { pid, tid, reload } = useOutletContext();
  const { data: patient, error, loading, reload: reloadPatient } = useAsync(() => api.patient(pid), [pid]);
  if (loading && !patient) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reloadPatient} />;

  // Al guardar algo se recarga la ficha completa (la cabecera muestra estos mismos datos) y esta pestaña.
  const saved = () => { reload(); reloadPatient(); };

  return (
    <div className="tab-body data-tab">
      <PhotoCard patient={patient} onSaved={saved} />

      <Section title="Identificación" description="Como aparece en el documento del paciente." patient={patient} keys={["document_type", "document_number", "birth_date", "dominant_side", "occupation"]} onSaved={saved}>
        {(f) => (
          <>
            <Field label="Tipo de documento">
              <select value={f.values.document_type} onChange={f.set("document_type")}>
                <option value="">Sin registrar</option>
                {Object.entries(DOCUMENT_TYPES).map(([k, label]) => <option key={k} value={k}>{k} · {label}</option>)}
              </select>
            </Field>
            <Field label="Número de documento" hint="Con o sin puntos. Ej. 1.020.304.050"><input inputMode="numeric" value={f.values.document_number} onChange={f.set("document_number")} autoComplete="off" /></Field>
            <Field label="Fecha de nacimiento"><input type="date" value={f.values.birth_date} onChange={f.set("birth_date")} /></Field>
            <Field label="Mano o lado dominante">
              <select value={f.values.dominant_side} onChange={f.set("dominant_side")}>
                <option value="">Sin registrar</option>
                {Object.entries(SIDE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
            <Field label="Ocupación" hint="Ayuda a definir la meta funcional"><input value={f.values.occupation} onChange={f.set("occupation")} maxLength={80} /></Field>
          </>
        )}
      </Section>

      <Section title="Contacto" description="Para llamar o escribir por WhatsApp desde la lista de pacientes." patient={patient} keys={["phone", "city", "emergency_contact_name", "emergency_contact_phone"]} onSaved={saved}>
        {(f) => (
          <>
            <Field label="Celular" hint="10 dígitos, empieza por 3. Ej. 300 123 4567 (se acepta +57)"><input type="tel" inputMode="tel" value={f.values.phone} onChange={f.set("phone")} autoComplete="off" /></Field>
            <Field label="Ciudad"><input value={f.values.city} onChange={f.set("city")} maxLength={80} /></Field>
            <Field label="Contacto de emergencia"><input value={f.values.emergency_contact_name} onChange={f.set("emergency_contact_name")} maxLength={100} placeholder="Nombre" /></Field>
            <Field label="Celular del contacto de emergencia"><input type="tel" inputMode="tel" value={f.values.emergency_contact_phone} onChange={f.set("emergency_contact_phone")} autoComplete="off" /></Field>
          </>
        )}
      </Section>

      <Section title="Salud y lesión" description="Datos clínicos de la lesión. El diagnóstico usa el código CIE-10 que se emplea en Colombia." patient={patient} keys={["eps", "diagnosis_code", "fracture_site", "injury_date", "surgery_date", "recovery_phase"]} onSaved={saved}>
        {(f) => (
          <>
            <Field label="EPS o aseguradora"><input value={f.values.eps} onChange={f.set("eps")} maxLength={80} autoComplete="off" /></Field>
            <Field label="Diagnóstico (CIE-10)" hint="Ej. S82.2. Escribe el código o elige uno de la lista.">
              <input list="cie10" value={f.values.diagnosis_code} onChange={f.set("diagnosis_code")} autoComplete="off" />
            </Field>
            <datalist id="cie10">{CIE10_SUGGESTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</datalist>
            <Field label="Lesión (zona)"><input value={f.values.fracture_site} onChange={f.set("fracture_site")} maxLength={120} placeholder="Ej. Tibia derecha" /></Field>
            <Field label="Fecha de la lesión"><input type="date" value={f.values.injury_date} onChange={f.set("injury_date")} /></Field>
            <Field label="Fecha de la cirugía" hint="Déjala vacía si no hubo cirugía"><input type="date" value={f.values.surgery_date} onChange={f.set("surgery_date")} /></Field>
            <Field label="Etapa de recuperación">
              <select value={f.values.recovery_phase} onChange={f.set("recovery_phase")}>
                <option value="">Sin definir</option>
                {PHASE_ORDER.map((k) => <option key={k} value={k}>{PHASES[k].label} — {PHASES[k].hint}</option>)}
              </select>
            </Field>
          </>
        )}
      </Section>

      <ConsentCard patient={patient} tid={tid} onSaved={saved} />
    </div>
  );
}
