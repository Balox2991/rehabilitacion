import Icon from "./Icon.jsx";

export default function Disclaimer({ children }) {
  return (
    <p className="disclaimer" role="note">
      <Icon name="alert" size={18} />
      <span>{children ?? "Contenido educativo general. Tu fisioterapeuta o cirujano define qué ejercicios hacer, cuánto y desde cuándo. Si algo te duele o te preocupa, avísale antes de continuar."}</span>
    </p>
  );
}
