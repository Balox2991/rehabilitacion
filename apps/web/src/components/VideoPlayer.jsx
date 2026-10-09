// Video de referencia de la clínica. El backend ya validó que la URL sea de YouTube o Vimeo por https
// (ver apps/backend/src/video.js); aquí solo se incrusta con permisos mínimos y sin reproducción automática.
export default function VideoPlayer({ embedUrl, title }) {
  if (!embedUrl) return null;
  return (
    <div className="video">
      <iframe
        src={embedUrl}
        title={`Video: ${title}`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
