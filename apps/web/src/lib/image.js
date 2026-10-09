// Preparación de la foto del paciente en el navegador: recorte cuadrado centrado, reducción y JPEG.
// La foto sale del computador ya pequeña (unos 15–30 KB), así el servidor nunca recibe imágenes enormes.

// Recorte cuadrado centrado de una imagen w × h. Función pura (probada).
export function squareCrop(w, h) {
  const side = Math.min(w, h);
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export async function resizeToJpeg(file, size = 256, quality = 0.85) {
  if (!file?.type?.startsWith("image/")) throw new Error("Elige un archivo de imagen (JPG o PNG).");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("La imagen pesa demasiado (máximo 15 MB).");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); // respeta la rotación de las fotos de celular
  } catch {
    throw new Error("No se pudo leer la imagen. Prueba con otra foto.");
  }
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // los PNG con fondo transparente quedan sobre blanco (JPEG no tiene transparencia)
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo procesar la imagen.");
  return blob;
}
