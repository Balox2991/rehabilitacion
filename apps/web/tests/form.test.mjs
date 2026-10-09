import { test } from "node:test";
import assert from "node:assert/strict";
import { diffValues } from "../src/lib/useSectionForm.js";
import { squareCrop } from "../src/lib/image.js";

test("diffValues envía solo lo que cambió y trata vacío y null como lo mismo", () => {
  const base = { city: "Cali", eps: null, phone: "" };
  assert.deepEqual(diffValues({ city: "Cali", eps: "", phone: "" }, base), {}, "null y '' son lo mismo: no hay cambios");
  assert.deepEqual(diffValues({ city: "Bogotá", eps: "", phone: "3001234567" }, base), { city: "Bogotá", phone: "3001234567" });
  assert.deepEqual(diffValues({ city: "", eps: null, phone: "" }, base), { city: "", }, "borrar un dato se envía como vacío");
});

test("squareCrop centra el recorte cuadrado en imágenes horizontales, verticales y cuadradas", () => {
  assert.deepEqual(squareCrop(400, 300), { sx: 50, sy: 0, side: 300 });
  assert.deepEqual(squareCrop(300, 500), { sx: 0, sy: 100, side: 300 });
  assert.deepEqual(squareCrop(256, 256), { sx: 0, sy: 0, side: 256 });
  assert.deepEqual(squareCrop(301, 300), { sx: 1, sy: 0, side: 300 }, "redondea sin salirse de la imagen");
});
