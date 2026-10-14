// Плоский фон сцены 9:16 (viewBox 0 0 360 640): стена, пол, окно, стол, кружка, растение.
// Чистый SVG без фильтров и градиентов-масок. Два варианта: office / kitchen (цвета).

const THEMES = {
  office: {
    wall: '#e8eef5', wallLine: '#d6dfea', floor: '#c9a27a', floorLine: '#b88c63',
    table: '#8d6a4b', tableTop: '#a67c57', sky: '#9fd3f4', frame: '#ffffff',
    mug: '#e04e5c', pot: '#c75c3a', leaf: '#4fa36b',
  },
  kitchen: {
    wall: '#f6ecd8', wallLine: '#ead9bb', floor: '#9fb3c8', floorLine: '#86a0b8',
    table: '#6f5b4a', tableTop: '#d9c3a3', sky: '#ffd9a8', frame: '#ffffff',
    mug: '#3f88c5', pot: '#b36b3c', leaf: '#5aa96a',
  },
}

export default function SceneBackground({ id = 'office' }) {
  const t = THEMES[id] ?? THEMES.office
  return (
    <svg className="scene-bg" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* Стена и пол */}
      <rect width="360" height="640" fill={t.wall} />
      <rect y="430" width="360" height="210" fill={t.floor} />
      <line x1="0" y1="430" x2="360" y2="430" stroke={t.floorLine} strokeWidth="3" />
      <g stroke={t.floorLine} strokeWidth="1.5" opacity="0.6">
        <line x1="0" y1="490" x2="360" y2="490" />
        <line x1="0" y1="560" x2="360" y2="560" />
      </g>
      {/* Плинтус и тонкие линии стены */}
      <rect y="418" width="360" height="12" fill={t.wallLine} />
      <g stroke={t.wallLine} strokeWidth="2" opacity="0.5">
        <line x1="0" y1="200" x2="360" y2="200" />
        <line x1="0" y1="300" x2="360" y2="300" />
      </g>

      {/* Окно */}
      <g data-part="window" transform="translate(36 70)">
        <rect width="150" height="170" rx="8" fill={t.frame} />
        <rect x="10" y="10" width="130" height="150" rx="4" fill={t.sky} />
        <circle cx="105" cy="45" r="16" fill="#fff3b0" />
        <ellipse cx="50" cy="60" rx="24" ry="9" fill="#fff" opacity="0.9" />
        <ellipse cx="64" cy="54" rx="14" ry="8" fill="#fff" opacity="0.9" />
        <ellipse cx="98" cy="110" rx="20" ry="8" fill="#fff" opacity="0.8" />
        <rect x="72" y="10" width="6" height="150" fill={t.frame} />
        <rect x="10" y="82" width="130" height="6" fill={t.frame} />
        <rect x="-6" y="170" width="162" height="10" rx="3" fill={t.wallLine} />
      </g>

      {/* Часы */}
      <g data-part="clock" transform="translate(280 120)">
        <circle r="26" fill="#fff" stroke={t.wallLine} strokeWidth="4" />
        <line x1="0" y1="0" x2="0" y2="-15" stroke="#444" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="0" x2="11" y2="6" stroke="#444" strokeWidth="3" strokeLinecap="round" />
        <circle r="2.5" fill="#444" />
      </g>

      {/* Стол (в глубине, между котами) */}
      <g data-part="table" transform="translate(180 400)">
        <rect x="-70" y="-6" width="140" height="14" rx="4" fill={t.tableTop} />
        <rect x="-60" y="8" width="10" height="46" fill={t.table} />
        <rect x="50" y="8" width="10" height="46" fill={t.table} />
        <rect x="-70" y="8" width="140" height="6" fill={t.table} />
        {/* Кружка */}
        <g data-part="mug" transform="translate(28 -6)">
          <rect x="-10" y="-22" width="20" height="22" rx="3" fill={t.mug} />
          <path d="M10 -16 q10 0 10 7 q0 7 -10 7" fill="none" stroke={t.mug} strokeWidth="3.5" />
          <rect x="-10" y="-22" width="20" height="4" rx="1.5" fill="#fff" opacity="0.5" />
          <path d="M-4 -30 q2 -4 0 -8 M3 -30 q2 -4 0 -8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </g>
        {/* Ноутбук */}
        <g data-part="laptop" transform="translate(-26 -6)">
          <rect x="-22" y="-26" width="40" height="26" rx="2" fill="#4a5568" />
          <rect x="-19" y="-23" width="34" height="20" rx="1" fill="#9ecbff" />
          <rect x="-26" y="0" width="48" height="4" rx="1.5" fill="#718096" />
        </g>
      </g>

      {/* Растение в горшке — справа у стены */}
      <g data-part="plant" transform="translate(318 420)">
        <rect x="-16" y="-20" width="32" height="22" rx="3" fill={t.pot} />
        <rect x="-18" y="-22" width="36" height="6" rx="2" fill={t.pot} opacity="0.85" />
        <ellipse cx="-12" cy="-40" rx="9" ry="18" fill={t.leaf} transform="rotate(-25 -12 -40)" />
        <ellipse cx="12" cy="-40" rx="9" ry="18" fill={t.leaf} transform="rotate(25 12 -40)" />
        <ellipse cx="0" cy="-50" rx="9" ry="24" fill={t.leaf} />
        <ellipse cx="-4" cy="-32" rx="7" ry="12" fill={t.leaf} opacity="0.85" transform="rotate(-50 -4 -32)" />
      </g>

      {/* Картина на стене */}
      <g data-part="picture" transform="translate(250 230)">
        <rect x="-32" y="-24" width="64" height="48" rx="3" fill="#fff" stroke={t.wallLine} strokeWidth="4" />
        <polygon points="-24,16 -6,-8 8,8 16,0 24,16" fill={t.leaf} opacity="0.7" />
        <circle cx="14" cy="-10" r="5" fill="#fff3b0" />
      </g>
    </svg>
  )
}
