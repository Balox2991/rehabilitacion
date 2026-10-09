// Validación del formulario de ingreso (pura; probada en tests/loginForm.test.mjs).
// Solo comprueba la FORMA de lo escrito, para avisar antes de enviar. Quién es quién lo decide el servidor.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

// Devuelve { email?, password? } con el mensaje de cada campo inválido; {} si todo está bien.
export function validateLogin({ email, password }) {
  const errors = {};
  const mail = normalizeEmail(email);
  if (!mail) errors.email = "Escribe tu correo electrónico.";
  else if (!EMAIL.test(mail)) errors.email = "Revisa el correo: debe tener la forma nombre@dominio.com.";
  if (!password) errors.password = "Escribe tu contraseña.";
  return errors;
}
