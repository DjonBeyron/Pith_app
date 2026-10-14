// Лицо кота: глаза (с эмоцией), нос, усы и рот трёх форм. Координаты — в системе
// головы (центр головы = 0,0, радиус ≈ 48). Чистые фигуры без фильтров/масок.

function Eye({ x, colors, emotion }) {
  const pupilRy = emotion === 'surprised' ? 9 : 6
  const pupilRx = emotion === 'surprised' ? 5 : 3
  return (
    <g data-part="eye" transform={`translate(${x} -4)`}>
      <ellipse rx="11" ry="13" fill="#fff" />
      <circle r="7.5" fill={colors.eye} />
      <ellipse rx={pupilRx} ry={pupilRy} fill="#1e1e24" />
      <circle cx="-3" cy="-4" r="2.2" fill="#fff" />
      {/* Веко — усталость: прикрывает верх глаза */}
      {emotion === 'tired' && (
        <path d="M-12 -13 H12 V-2 Q0 -6 -12 -2 Z" fill={colors.body} />
      )}
      {/* Радость: нижнее веко приподнято — глаз «улыбается» */}
      {emotion === 'happy' && (
        <path d="M-12 14 H12 V6 Q0 0 -12 6 Z" fill={colors.body} />
      )}
    </g>
  )
}

function Mouth({ shape, emotion }) {
  const dark = '#3b2a2a'
  const pink = '#f08a9b'
  if (shape === 'open') {
    return (
      <g data-part="mouth" data-shape="open">
        <ellipse cy="7" rx="8" ry="7.5" fill={dark} />
        <ellipse cy="11" rx="4.5" ry="3" fill={pink} />
      </g>
    )
  }
  if (shape === 'half') {
    return (
      <g data-part="mouth" data-shape="half">
        <ellipse cy="5" rx="6" ry="3.5" fill={dark} />
      </g>
    )
  }
  // закрытый рот: «w» с уголками; у радости — шире
  const d = emotion === 'happy'
    ? 'M-12 0 Q-6 8 0 1 Q6 8 12 0'
    : 'M-9 0 Q-4.5 5 0 1 Q4.5 5 9 0'
  return (
    <g data-part="mouth" data-shape="closed">
      <path d={d} fill="none" stroke={dark} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  )
}

export default function CatFace({ colors, emotion = 'neutral', mouth = 'closed' }) {
  const whisker = '#4a3a3a'
  return (
    <g data-part="face">
      <g data-part="eyes" className="cat-eyes">
        <Eye x={-18} colors={colors} emotion={emotion} />
        <Eye x={18} colors={colors} emotion={emotion} />
      </g>
      {/* Щёчки */}
      <circle cx="-30" cy="14" r="6" fill="#f6b0a8" opacity="0.55" />
      <circle cx="30" cy="14" r="6" fill="#f6b0a8" opacity="0.55" />
      {/* Нос */}
      <polygon data-part="nose" points="-5,12 5,12 0,18" fill={colors.nose} />
      <line x1="0" y1="18" x2="0" y2="22" stroke="#3b2a2a" strokeWidth="1.6" strokeLinecap="round" />
      {/* Усы */}
      <g data-part="whiskers" stroke={whisker} strokeWidth="1.4" strokeLinecap="round" opacity="0.8">
        <line x1="-28" y1="14" x2="-56" y2="8" />
        <line x1="-28" y1="20" x2="-56" y2="22" />
        <line x1="28" y1="14" x2="56" y2="8" />
        <line x1="28" y1="20" x2="56" y2="22" />
      </g>
      <g transform="translate(0 22)">
        <Mouth shape={mouth} emotion={emotion} />
      </g>
    </g>
  )
}
