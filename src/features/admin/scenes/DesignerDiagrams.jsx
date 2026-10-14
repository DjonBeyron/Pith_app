// Картинки-схемы для спецификации дизайнера (inline SVG, без внешних файлов): холст кота с
// именованными группами, холст сцены со слоями и якорями, три виземы рта, четыре эмоции.
// Цвета — токены темы (currentColor / var(--sc-*)), чтобы читались в тёмной и светлой.

const L = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }
const DASH = { ...L, strokeDasharray: '4 3', opacity: 0.6 }
const T = { fontSize: 10, fill: 'currentColor', fontFamily: 'inherit' }

export function CatCanvasDiagram() {
  return (
    <svg className="scdFig" viewBox="-10 -14 260 268" role="img" aria-label="Холст кота 200×240: хвост, тело, лапы, голова, уши, лицо">
      <rect x="0" y="0" width="200" height="240" {...DASH} />
      <text x="0" y="-4" {...T}>0,0</text>
      <text x="150" y="-4" {...T}>200 × 240</text>
      <path d="M148 200 C 174 194, 192 158, 178 122" {...L} strokeWidth="12" strokeLinecap="round" opacity="0.5" />
      <text x="196" y="130" {...T}>tail</text>
      <ellipse cx="100" cy="176" rx="56" ry="54" {...L} />
      <text x="56" y="150" {...T}>body</text>
      <ellipse cx="74" cy="224" rx="19" ry="10" {...L} /><ellipse cx="126" cy="224" rx="19" ry="10" {...L} />
      <text x="150" y="232" {...T}>paws</text>
      <circle cx="100" cy="96" r="48" {...L} />
      <text x="24" y="92" {...T}>head</text>
      <polygon points="56,80 64,32 94,56" {...L} /><polygon points="144,80 136,32 106,56" {...L} />
      <text x="150" y="40" {...T}>ears</text>
      <ellipse cx="82" cy="92" rx="11" ry="13" {...L} /><ellipse cx="118" cy="92" rx="11" ry="13" {...L} />
      <text x="112" y="72" {...T}>eyes</text>
      <path d="M91 118 Q95.5 123 100 119 Q104.5 123 109 118" {...L} />
      <text x="112" y="124" {...T}>mouth</text>
      <path d="M72 110 L44 104 M72 116 L44 118" {...L} opacity="0.6" />
      <text x="14" y="128" {...T}>whiskers</text>
      <circle cx="100" cy="96" r="2.5" fill="var(--sc-accent, #e0564e)" />
      <text x="152" y="100" {...T} fontSize="9">центр (100,96)</text>
    </svg>
  )
}

export function SceneLayersDiagram() {
  return (
    <svg className="scdFig" viewBox="-10 -14 380 668" role="img" aria-label="Холст сцены 360×640: слои стена, пол, стол, на столе; места котов и слотов">
      <rect x="0" y="0" width="360" height="640" {...DASH} />
      <text x="0" y="-4" {...T}>0,0</text>
      <text x="300" y="-4" {...T}>360 × 640</text>
      <rect x="0" y="0" width="360" height="430" fill="currentColor" opacity="0.05" />
      <text x="8" y="22" {...T}>слой wall (стена): y 0…430</text>
      <rect x="0" y="430" width="360" height="210" fill="currentColor" opacity="0.12" />
      <text x="8" y="452" {...T}>слой floor (пол): y 430…640</text>
      <rect x="105" y="410" width="150" height="60" {...L} />
      <text x="112" y="404" {...T}>table (стол) якорь 180,470</text>
      <circle cx="142" cy="412" r="3" fill="var(--sc-accent, #e0564e)" /><circle cx="180" cy="412" r="3" fill="var(--sc-accent, #e0564e)" /><circle cx="220" cy="412" r="3" fill="var(--sc-accent, #e0564e)" />
      <text x="226" y="416" {...T} fontSize="9">tabletop</text>
      <rect x="22" y="444" width="140" height="168" rx="20" {...L} /><text x="60" y="540" {...T}>кот A</text>
      <rect x="198" y="444" width="140" height="168" rx="20" {...L} /><text x="236" y="540" {...T}>кот B</text>
      <rect x="36" y="60" width="150" height="180" {...DASH} /><text x="40" y="54" {...T}>window 111,150</text>
      <rect x="216" y="115" width="92" height="70" {...DASH} /><text x="220" y="110" {...T}>wall-board 262,150</text>
      <rect x="227" y="223" width="70" height="54" {...DASH} /><text x="231" y="218" {...T}>wall-art 262,250</text>
      <circle cx="26" cy="468" r="4" fill="var(--sc-accent, #e0564e)" /><text x="4" y="486" {...T} fontSize="9">floor-left</text>
      <circle cx="334" cy="468" r="4" fill="var(--sc-accent, #e0564e)" /><text x="300" y="486" {...T} fontSize="9">floor-right</text>
      <text x="8" y="630" {...T}>● — якорь слота: предмет ставится точкой (0,0) сюда</text>
    </svg>
  )
}

function Mouth({ x, kind, label }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <circle cx="30" cy="30" r="26" {...L} />
      {kind === 'closed' && <path d="M21 36 Q25.5 41 30 37 Q34.5 41 39 36" {...L} strokeWidth="2.2" />}
      {kind === 'half' && <ellipse cx="30" cy="39" rx="6" ry="3.5" fill="currentColor" />}
      {kind === 'open' && <><ellipse cx="30" cy="40" rx="8" ry="7.5" fill="currentColor" /><ellipse cx="30" cy="44" rx="4.5" ry="3" fill="var(--sc-accent, #e0564e)" /></>}
      <text x="30" y="72" textAnchor="middle" {...T}>{label}</text>
    </g>
  )
}

export function VisemesDiagram() {
  return (
    <svg className="scdFig scdFigRow" viewBox="0 0 230 80" role="img" aria-label="Три формы рта: closed, half, open">
      <Mouth x={0} kind="closed" label="closed" /><Mouth x={85} kind="half" label="half" /><Mouth x={170} kind="open" label="open" />
    </svg>
  )
}

function Face({ x, emotion, label }) {
  const lid = emotion === 'tired' ? 'M-12 -13 H12 V-2 Q0 -6 -12 -2 Z' : emotion === 'happy' ? 'M-12 14 H12 V6 Q0 0 -12 6 Z' : null
  const brow = emotion === 'surprised' ? 'M-26 -24 q8 -6 16 -2 M26 -24 q-8 -6 -16 -2' : emotion === 'tired' ? 'M-26 -20 q8 1 16 -3 M26 -20 q-8 1 -16 -3' : 'M-26 -21 q8 -3 16 -1 M26 -21 q-8 -3 -16 -1'
  const mouth = emotion === 'happy' ? 'M-12 22 Q-6 30 0 23 Q6 30 12 22' : emotion === 'tired' ? 'M-9 24 Q-4.5 21 0 24 Q4.5 21 9 24' : 'M-9 22 Q-4.5 27 0 23 Q4.5 27 9 22'
  const eye = dx => (
    <g transform={`translate(${dx} -4)`}>
      <ellipse rx="11" ry="13" {...L} /><circle r={emotion === 'surprised' ? 5 : 3} cy="0" fill="currentColor" />
      {lid && <path d={lid} fill="currentColor" opacity="0.35" />}
    </g>
  )
  return (
    <g transform={`translate(${x} 50)`}>
      <circle r="46" {...L} />
      {eye(-18)}{eye(18)}
      <path d={brow} {...L} strokeWidth="2.5" /><path d={mouth} {...L} strokeWidth="2.2" />
      <text y="64" textAnchor="middle" {...T}>{label}</text>
    </g>
  )
}

export function EmotionsDiagram() {
  return (
    <svg className="scdFig scdFigRow" viewBox="0 0 420 122" role="img" aria-label="Четыре эмоции: neutral, happy, tired, surprised">
      <Face x={52} emotion="neutral" label="neutral — спокоен" />
      <Face x={158} emotion="happy" label="happy — рад (нижнее веко)" />
      <Face x={264} emotion="tired" label="tired — устал (верхнее веко)" />
      <Face x={370} emotion="surprised" label="surprised — зрачки шире" />
    </svg>
  )
}
