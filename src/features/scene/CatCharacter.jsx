import { useEffect, useState } from 'react'
import CatFace from './CatFace.jsx'

// SVG-кот, разобранный на именованные группы (data-part): хвост, тело, лапы, голова, уши, лицо.
// Идл-анимации (дыхание, покачивание головы, моргание, хвост) — CSS в scene-cat.css:
// без SVG-фильтров, масок и feTurbulence (лагают на iPhone). viewBox 0 0 200 240.
//
// talking: рот чередует формы по таймеру; wordTick (растёт на границе слова) — рот открывается
// на слове и цикл начинается заново, так движение совпадает с речью.

const MOUTH_CYCLE = ['open', 'half', 'closed', 'half']
const MOUTH_STEP_MS = 110

function useTalkingMouth(talking, wordTick) {
  const [mouth, setMouth] = useState('closed')
  useEffect(() => {
    if (!talking) return undefined
    let i = 0
    const raf = requestAnimationFrame(() => setMouth('open'))
    const id = setInterval(() => {
      i += 1
      setMouth(MOUTH_CYCLE[i % MOUTH_CYCLE.length])
    }, MOUTH_STEP_MS)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [talking, wordTick])
  return talking ? mouth : 'closed'
}

export default function CatCharacter({
  colors,
  emotion = 'neutral',
  pose = 'idle',
  talking = false,
  wordTick = 0,
  flip = false,
  className = '',
  style,
}) {
  const mouth = useTalkingMouth(talking, wordTick)
  const cls = ['cat', `cat--${pose}`, talking ? 'cat--talking' : '', flip ? 'cat--flip' : '', className]
    .filter(Boolean).join(' ')

  return (
    <svg className={cls} style={style} viewBox="0 0 200 240" role="img" aria-label="Кот">
      <g className="cat-root" transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
        {/* Хвост — за телом; качается от основания (translate задаёт точку вращения) */}
        <g data-part="tail" transform="translate(148 200)">
          <g className="cat-tail">
            <path
              d="M0 0 C 26 -6, 44 -42, 30 -78"
              fill="none" stroke={colors.body} strokeWidth="15" strokeLinecap="round"
            />
            <path
              d="M38 -52 C 42 -62, 40 -72, 30 -78"
              fill="none" stroke={colors.stripe} strokeWidth="15" strokeLinecap="round"
            />
          </g>
        </g>

        {/* Тело — дышит (лёгкий scale по вертикали от низа) */}
        <g data-part="body" className="cat-body">
          <ellipse cx="100" cy="176" rx="58" ry="54" fill={colors.body} />
          <ellipse cx="100" cy="190" rx="36" ry="32" fill={colors.belly} />
          {/* Полоски на боках */}
          <path d="M52 150 q10 8 18 0" fill="none" stroke={colors.stripe} strokeWidth="4" strokeLinecap="round" />
          <path d="M130 150 q10 8 18 0" fill="none" stroke={colors.stripe} strokeWidth="4" strokeLinecap="round" />
          {/* Лапы */}
          <g data-part="paws">
            <ellipse cx="74" cy="224" rx="19" ry="10" fill={colors.body} />
            <ellipse cx="126" cy="224" rx="19" ry="10" fill={colors.body} />
            <g stroke={colors.stripe} strokeWidth="1.8" strokeLinecap="round" opacity="0.7">
              <line x1="68" y1="228" x2="68" y2="232" />
              <line x1="76" y1="229" x2="76" y2="233" />
              <line x1="120" y1="228" x2="120" y2="232" />
              <line x1="128" y1="229" x2="128" y2="233" />
            </g>
          </g>
        </g>

        {/* Голова — покачивается; центр головы (0,0) */}
        <g data-part="head" transform="translate(100 96)">
          <g className="cat-head">
            {/* Уши */}
            <g data-part="ears">
              <polygon points="-44,-16 -36,-64 -6,-40" fill={colors.body} />
              <polygon points="-37,-22 -33,-52 -14,-37" fill={colors.ear} />
              <polygon points="44,-16 36,-64 6,-40" fill={colors.body} />
              <polygon points="37,-22 33,-52 14,-37" fill={colors.ear} />
            </g>
            <circle r="48" fill={colors.body} />
            {/* Полоски на лбу */}
            <g stroke={colors.stripe} strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M-12 -40 q4 10 0 20" />
              <path d="M0 -44 q4 12 0 24" />
              <path d="M12 -40 q4 10 0 20" />
            </g>
            {/* Светлая мордочка */}
            <ellipse cy="18" rx="26" ry="18" fill={colors.belly} opacity="0.9" />
            <CatFace colors={colors} emotion={emotion} mouth={mouth} />
          </g>
        </g>
      </g>
    </svg>
  )
}
