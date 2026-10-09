import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/useAsync.js";
import { FILTERS, SORTS, applyView } from "../../lib/patientList.js";
import { PHASES, PHASE_ORDER } from "../../lib/labels.js";
import { ErrorState, Loading } from "../../components/PageState.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Field from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import PatientRow from "../../components/PatientRow.jsx";

// Lista de pacientes. Filtro, orden y búsqueda viven en la URL (?estado=…&orden=…&q=…): se pueden compartir,
// el botón «atrás» funciona y al volver de una ficha la lista queda tal cual estaba.
export default function Patients() {
  const { tid } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => api.therapistSummary(tid), [tid]);

  const estado = params.get("estado") ?? "todos";
  const orden = params.get("orden") ?? "prioridad";
  const q = params.get("q") ?? "";
  const adding = params.get("nuevo") === "1";

  const setParam = (key, value, fallback = "") =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || value === fallback) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });

  const shown = useMemo(() => (data ? applyView(data.patients, { estado, orden, q }) : []), [data, estado, orden, q]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const total = data.patients.length;
  const filtersActive = estado !== "todos" || q.trim() !== "";

  return (
    <div className="page-inner stack">
      <PageHeader
        title="Pacientes"
        description={`${total} en seguimiento. Abre una ficha para ver su evolución, ajustar el plan o generar un informe.`}
        actions={<button className="btn btn-primary" onClick={() => setParam("nuevo", adding ? "" : "1")} aria-expanded={adding}><Icon name="plus" size={18} /> Nuevo paciente</button>}
      />

      {adding && <NewPatient tid={tid} onCancel={() => setParam("nuevo", "")} />}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">Buscar pacientes</span>
          <input type="search" placeholder="Buscar por nombre, lesión, código o ciudad…" value={q} onChange={(e) => setParam("q", e.target.value)} />
        </label>
        <label className="select-inline">
          <span>Ordenar por</span>
          <select value={orden} onChange={(e) => setParam("orden", e.target.value, "prioridad")}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${estado === f.id ? "is-on" : ""}`} aria-pressed={estado === f.id} onClick={() => setParam("estado", f.id, "todos")}>
            {f.label} <span className="num">{data.patients.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      <p className="result-count" role="status">{shown.length === total ? `${total} pacientes` : `${shown.length} de ${total} pacientes`}</p>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="search"
            title={total === 0 ? "Aún no tienes pacientes" : "Ningún paciente coincide"}
            action={filtersActive ? <button className="btn btn-ghost btn-sm" onClick={() => setParams({}, { replace: true })}>Quitar filtros</button> : undefined}
          >
            {total === 0 ? "Crea el primero con «Nuevo paciente»." : "Prueba con otra búsqueda o quita los filtros."}
          </EmptyState>
        </div>
      ) : (
        <ul className="prow-list">
          {shown.map((p) => <PatientRow key={p.id} p={p} tid={tid} />)}
        </ul>
      )}
    </div>
  );
}

// Alta rápida: lo mínimo para empezar. La ficha completa se termina de llenar en la pestaña «Datos» del paciente.
function NewPatient({ tid, onCancel }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", fracture_site: "", injury_date: "", recovery_phase: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { name: form.name, email: form.email, therapist_id: Number(tid) };
      for (const k of ["phone", "fracture_site", "injury_date", "recovery_phase"]) if (form[k]) body[k] = form[k];
      const created = await api.createPatient(body);
      navigate(`/fisio/${tid}/paciente/${created.id}/datos`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="card panel form-panel" onSubmit={submit}>
      <div className="panel-head"><div><h2>Nuevo paciente</h2><p>Lo esencial para empezar. Después completas la ficha (documento, EPS, diagnóstico…) en la pestaña «Datos».</p></div></div>
      <div className="form-grid">
        <Field label="Nombre completo"><input required value={form.name} onChange={set("name")} autoComplete="off" /></Field>
        <Field label="Correo electrónico"><input required type="email" value={form.email} onChange={set("email")} autoComplete="off" /></Field>
        <Field label="Celular" hint="10 dígitos, empieza por 3. Ej. 300 123 4567"><input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="off" /></Field>
        <Field label="Lesión"><input value={form.fracture_site} onChange={set("fracture_site")} placeholder="Ej. Tibia derecha" /></Field>
        <Field label="Fecha de la lesión"><input type="date" value={form.injury_date} onChange={set("injury_date")} /></Field>
        <Field label="Etapa de recuperación">
          <select value={form.recovery_phase} onChange={set("recovery_phase")}>
            <option value="">Sin definir</option>
            {PHASE_ORDER.map((k) => <option key={k} value={k}>{PHASES[k].label}</option>)}
          </select>
        </Field>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="form-footer">
        <div className="form-footer-buttons">
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Creando…" : "Crear y completar ficha"}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </form>
  );
}
