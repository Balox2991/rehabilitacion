import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, validateLogin } from "../src/lib/loginForm.js";

test("un correo y una contraseña con forma válida no generan errores", () => {
  assert.deepEqual(validateLogin({ email: "ana@clinica.co", password: "x" }), {});
});

test("el correo se normaliza (espacios y mayúsculas) antes de validar y de enviar", () => {
  assert.equal(normalizeEmail("  Ana@Clinica.CO "), "ana@clinica.co");
  assert.deepEqual(validateLogin({ email: "  Ana@Clinica.CO ", password: "x" }), {});
  assert.equal(normalizeEmail(undefined), "");
});

test("campos vacíos piden cada dato con su propio mensaje", () => {
  const e = validateLogin({ email: "", password: "" });
  assert.match(e.email, /correo/);
  assert.match(e.password, /contraseña/);
});

test("correos mal formados se rechazan", () => {
  for (const email of ["ana", "ana@", "@clinica.co", "ana@clinica", "ana @clinica.co", "ana@clinica.c"]) {
    assert.ok(validateLogin({ email, password: "x" }).email, `debería rechazar «${email}»`);
  }
});

test("la contraseña no se recorta: un espacio al final puede ser parte de ella", () => {
  assert.deepEqual(validateLogin({ email: "ana@clinica.co", password: " " }), {});
});
