import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "../lib/format.js";

// Evolución del rango de movimiento (grados de flexión, mejor repetición de cada sesión) contra la meta del plan.
export default function RomChart({ history, targetFlexion, gradientId = "romFill" }) {
  const data = history.map((h) => ({ date: formatDay(h.started_at), flexion: h.flexion }));
  const top = Math.ceil((Math.max(targetFlexion, ...data.map((d) => d.flexion), 0) + 10) / 10) * 10;

  if (data.length < 2) {
    return <p className="chart-empty">Aún no hay suficientes sesiones para dibujar la evolución. Completa al menos dos.</p>;
  }

  return (
    <div className="chart" role="img" aria-label={`Evolución de la flexión: de ${data[0].flexion}° a ${data.at(-1).flexion}°, meta ${targetFlexion}°`}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 14, right: 16, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f86b3" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#1f86b3" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} minTickGap={28} />
          <YAxis domain={[0, top]} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} unit="°" width={44} />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", boxShadow: "var(--shadow-md)", fontSize: 13 }}
            formatter={(v) => [`${v}°`, "Flexión"]}
          />
          <ReferenceLine y={targetFlexion} stroke="var(--ink-3)" strokeDasharray="6 5" label={{ value: `Meta ${targetFlexion}°`, position: "insideTopRight", fill: "var(--ink-2)", fontSize: 12, fontWeight: 600 }} />
          <Area type="monotone" dataKey="flexion" stroke="#144c84" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, fill: "#144c84", stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
