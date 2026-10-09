import { Link } from "react-router-dom";
import StickDemo from "../demos/StickDemo.jsx";
import { hasDemo } from "../demos/demos.js";
import { areaLabel, difficultyLabel, phaseLabel } from "../lib/labels.js";
import Icon from "./Icon.jsx";

export function ExerciseCard({ item, to }) {
  return (
    <Link to={to} className="ex-card">
      <div className="ex-card-media">
        {hasDemo(item.demo) ? <StickDemo demo={item.demo} compact /> : <span className="ex-card-fallback"><Icon name={item.category === "educacion" ? "book" : "list"} size={34} /></span>}
        {item.tracked_exercise_code && <span className="badge-cam"><Icon name="camera" size={13} /> Con cámara</span>}
      </div>
      <div className="ex-card-body">
        <div className="ex-card-tags">
          <span className="pill pill-mute">{areaLabel(item.body_area)}</span>
          {item.category !== "educacion" && <span className="tag">{phaseLabel(item.phase)}</span>}
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="ex-card-foot">
          <span><Icon name="clock" size={14} /> {item.duration_min} min</span>
          {item.category !== "educacion" && <span>{difficultyLabel(item.difficulty)}</span>}
          {item.video_embed_url && <span><Icon name="video" size={14} /> Video</span>}
        </div>
      </div>
    </Link>
  );
}

export function RoutineCard({ routine, to, tag }) {
  return (
    <Link to={to} className="routine-card">
      <div className="routine-icon" aria-hidden="true"><Icon name="list" size={22} /></div>
      <div className="routine-body">
        <div className="ex-card-tags">
          {tag && <span className="pill pill-info">{tag}</span>}
          <span className="pill pill-mute">{areaLabel(routine.body_area)}</span>
          <span className="tag">{phaseLabel(routine.phase)}</span>
        </div>
        <h3>{routine.title}</h3>
        <p>{routine.summary}</p>
        <div className="ex-card-foot">
          <span><Icon name="clock" size={14} /> {routine.duration_min} min</span>
          <span>{routine.item_count} ejercicios</span>
        </div>
      </div>
      <Icon name="arrow" size={18} />
    </Link>
  );
}
