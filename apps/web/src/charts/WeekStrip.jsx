const DAY_NAME = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]; // tres letras: «M» de martes y de miércoles se confundían

// Últimos 7 días: un círculo por día, lleno si hubo sesión; el último es hoy.
export default function WeekStrip({ days }) {
  return (
    <ol className="weekstrip" aria-label="Actividad de los últimos 7 días">
      {days.map((d, i) => {
        const dow = new Date(`${d.date}T12:00:00Z`).getUTCDay();
        const done = d.sessions > 0;
        const today = i === days.length - 1;
        return (
          <li key={d.date} className={`${done ? "is-done" : ""} ${today ? "is-today" : ""}`}>
            <span className="weekstrip-dot" aria-hidden="true">{done ? "✓" : ""}</span>
            <span className="weekstrip-label">{today ? "Hoy" : DAY_NAME[dow]}</span>
            <span className="sr-only">{d.date}: {done ? `${d.sessions} sesión(es)` : "sin sesión"}</span>
          </li>
        );
      })}
    </ol>
  );
}
