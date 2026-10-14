// Мини-иллюстрации «хорошо / плохо» для инструкции дизайнера: inline SVG на currentColor.
const Mouth = ({ x, label }) => (
  <g transform={`translate(${x} 0)`}>
    <rect x="-22" y="6" width="44" height="30" rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
    <text x="0" y="50" textAnchor="middle" fontSize="9" fill="currentColor">{label}</text>
  </g>
)

export function GoodMouthFig() {
  return (
    <svg className="scdhFig" viewBox="0 0 200 60" role="img" aria-label="Хорошо: три отдельные формы рта">
      <g transform="translate(0 0)">
        <Mouth x={40} label="closed" /><Mouth x={100} label="half" /><Mouth x={160} label="open" />
        <path d="M30 24 Q40 30 50 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="100" cy="23" rx="8" ry="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="160" cy="23" rx="10" ry="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </g>
    </svg>
  )
}

export function BadMouthFig() {
  return (
    <svg className="scdhFig" viewBox="0 0 200 60" role="img" aria-label="Плохо: рот одной картинкой">
      <rect x="62" y="6" width="76" height="30" rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
      <path d="M78 20 Q100 34 122 20 Q100 14 78 20Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text x="100" y="50" textAnchor="middle" fontSize="9" fill="currentColor">один слитный рисунок</text>
    </svg>
  )
}
