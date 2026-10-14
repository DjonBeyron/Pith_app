// Облачко над говорящим котом: текст реплики + имя. HTML поверх сцены (не SVG —
// перенос строк и foreignObject на iOS ненадёжны). side: 'left' | 'right'.

export default function SpeechBubble({ text, name, side = 'left', visible = true }) {
  if (!visible || !text) return null
  return (
    <div className={`scene-bubble scene-bubble--${side}`} role="status" aria-live="polite">
      {name && <div className="scene-bubble__name">{name}</div>}
      <div className="scene-bubble__text">{text}</div>
      <span className="scene-bubble__tail" aria-hidden="true" />
    </div>
  )
}
