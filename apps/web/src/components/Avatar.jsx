import { useState } from "react";
import { photoUrl } from "../lib/api.js";
import { avatarTone, initials } from "../lib/patientList.js";

// Foto redonda del paciente o, si no tiene (o falla al cargar), sus iniciales sobre un tono suave y estable.
// `patient` = { id, name, has_photo, photo_v }. La foto se pide con ?v=<versión> para que un cambio se vea al instante.
export default function Avatar({ patient, size = "md" }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = patient.has_photo && !failed;
  return (
    <span className={`avatar2 avatar2-${size} tone-${avatarTone(patient.id)}`} role="img" aria-label={patient.name}>
      {showPhoto ? <img key={patient.photo_v} src={photoUrl(patient)} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">{initials(patient.name)}</span>}
    </span>
  );
}
