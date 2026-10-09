import Icon from "./Icon.jsx";

// Estado vacío con una salida clara: qué pasa y qué se puede hacer.
export default function EmptyState({ icon = "users", title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
