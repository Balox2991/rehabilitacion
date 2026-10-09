import StickDemo from "../demos/StickDemo.jsx";
import { hasDemo } from "../demos/demos.js";
import VideoPlayer from "./VideoPlayer.jsx";

// "Mira cómo se hace": demostración animada y/o video de la clínica, con los pasos y las precauciones.
export default function DemoPanel({ item, target, showSteps = true }) {
  const animated = hasDemo(item.demo);
  const video = item.video_embed_url;
  return (
    <div className="demo-panel">
      <div className="demo-media">
        {animated && <StickDemo demo={item.demo} target={target} />}
        {video && (
          <div>
            <p className="media-label">Video de referencia de tu clínica</p>
            <VideoPlayer embedUrl={video} title={item.title} />
          </div>
        )}
        {!animated && !video && (
          <div className="notice notice-info">Este ejercicio todavía no tiene demostración animada ni video. Sigue los pasos escritos o pídele a tu fisioterapeuta que te lo muestre.</div>
        )}
      </div>
      {showSteps && (
        <div className="demo-text">
          <h3>Cómo se hace</h3>
          <ol className="steps-list">
            {item.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <div className="cautions" role="note">
            <h4>Precauciones</h4>
            <ul>{item.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
