import { STATUS } from "../lib/format.js";

export default function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.sin_plan;
  return <span className={`pill pill-${s.tone}`}>{s.label}</span>;
}
