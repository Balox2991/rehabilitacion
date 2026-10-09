import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "../lib/format.js";

// Sesiones por semana de todos los pacientes; la semana más reciente se resalta.
export default function WeeklyBars({ weeks, height = 240 }) {
  const data = weeks.map((w) => ({ label: formatDay(w.week_start), sessions: w.sessions }));
  return (
    <div className="chart" role="img" aria-label={`Sesiones por semana en las últimas ${weeks.length} semanas; última semana: ${weeks.at(-1)?.sessions ?? 0}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(35,120,192,0.07)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", boxShadow: "var(--shadow-md)", fontSize: 13 }} formatter={(v) => [v, "Sesiones"]} labelFormatter={(l) => `Semana desde el ${l}`} />
          <Bar dataKey="sessions" radius={[6, 6, 0, 0]} maxBarSize={38}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === data.length - 1 ? "#144c84" : "#9cc4e2"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
