// Convierte un enlace de video que pega la clínica en una URL segura para incrustar (iframe).
// Solo YouTube y Vimeo, solo https, y siempre con el ID validado: nunca se incrusta una URL arbitraria.
// YouTube se incrusta con youtube-nocookie.com (sin cookies de seguimiento hasta que el usuario reproduce).

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

export function toEmbedUrl(raw) {
  if (typeof raw !== "string") return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com") {
    const id = parts[0] === "watch" ? u.searchParams.get("v") : ["embed", "shorts"].includes(parts[0]) ? parts[1] : null;
    return id && YT_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    return parts[0] && YT_ID.test(parts[0]) ? `https://www.youtube-nocookie.com/embed/${parts[0]}` : null;
  }
  if (host === "vimeo.com") {
    return parts[0] && VIMEO_ID.test(parts[0]) ? `https://player.vimeo.com/video/${parts[0]}` : null;
  }
  if (host === "player.vimeo.com" && parts[0] === "video") {
    return parts[1] && VIMEO_ID.test(parts[1]) ? `https://player.vimeo.com/video/${parts[1]}` : null;
  }
  return null;
}
