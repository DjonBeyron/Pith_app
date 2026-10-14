// Облачко реплики — HTML поверх SVG (перенос строк и foreignObject на iOS
// ненадёжны). side: 'a' (слева) | 'b' (справа). translation — строка под
// текстом (перевод/подсказка для уроков языка).

export default function SceneBubbleV2({ line, name, side = 'a', visible = true }) {
  if (!visible || !line?.text) return null
  return (
    <div className={`scn-bubble scn-bubble--${side}`} role="status" aria-live="polite">
      {name && <div className="scn-bubble__name">{name}</div>}
      <div className="scn-bubble__text">{line.text}</div>
      {line.translation && <div className="scn-bubble__tr">{line.translation}</div>}
      <span className="scn-bubble__tail" aria-hidden="true" />
    </div>
  )
}
