import { formatPhone, phoneHref, whatsappUrl } from "../lib/colombia.js";
import Icon from "./Icon.jsx";

// Acciones de contacto directo con el paciente: llamar y WhatsApp (muy usado en Colombia).
// El mensaje precargado es genérico y NO incluye datos de salud; el fisioterapeuta lo puede editar antes de enviar.
export default function ContactActions({ phone, name, from, compact = false }) {
  if (!phone) return <span className="contact-none">Sin teléfono registrado</span>;
  const first = name.split(" ")[0];
  const wa = whatsappUrl(phone, `Hola ${first}, le escribe ${from ?? "su fisioterapeuta"} de Clínica Ocaña por sus ejercicios de rehabilitación. ¿Cómo se ha sentido?`);
  return (
    <span className="contact-actions">
      <a className="btn btn-ghost btn-sm" href={phoneHref(phone)} aria-label={`Llamar a ${name} al ${formatPhone(phone)}`}>
        <Icon name="phone" size={16} /> {!compact && "Llamar"}
      </a>
      {wa && (
        <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Escribir por WhatsApp a ${name}`}>
          <Icon name="chat" size={16} /> {!compact && "WhatsApp"}
        </a>
      )}
    </span>
  );
}
