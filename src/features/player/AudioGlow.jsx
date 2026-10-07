import { useEffect, useRef } from 'react'
import { subscribeAudioLevel } from './audioLevel.js'
import { BARS, BAR_COUNT, barHeight } from './audioGlowShape.js'

// Свечение-эквалайзер снизу чата урока: фиолетовое (цвет постоянной памяти,
// --lvlP / WIRE_COLORS.perm), реагирует на речь — голосовые, озвучку слов,
// диктора таблиц (источники — audioLevel.js), но не на звуки интерфейса.
//
// Оптимизация: ни одного React-рендера во время игры — уровень приходит из
// общего rAF-цикла (≤30 кадров/с) и пишется прямо в transform столбиков и
// opacity подложки (только композитор, без Layout/Paint). В покое слой
// невидим (visibility:hidden через класс), will-change только пока играет.
// Запись в DOM — лишь если значение сдвинулось заметно (≥ MIN_DELTA).
// Форма столбиков — audioGlowShape.js
const MIN_DELTA = 0.02

export default function AudioGlow() {
  const rootRef = useRef(null)
  const baseRef = useRef(null)
  const barsRef = useRef([])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const last = new Float32Array(BAR_COUNT)
    let lastBase = -1
    let shown = false
    let hiddenTab = false

    const unsubscribe = subscribeAudioLevel((level, active, now) => {
      if (active !== shown) {
        shown = active
        // Плеер внутри скрытой вкладки оболочки — не светим и не пишем в DOM
        hiddenTab = active && !!root.closest('.shellV2TabHidden')
        root.classList.toggle('audioGlowOn', active && !hiddenTab)
        if (!active) { last.fill(0); lastBase = -1 }
      }
      // prefers-reduced-motion: статичное тусклое свечение задаёт CSS
      if (!active || hiddenTab || reduced) return
      const t = now / 1000
      const bars = barsRef.current
      for (let i = 0; i < BAR_COUNT; i++) {
        const v = barHeight(i, level, t)
        if (Math.abs(v - last[i]) < MIN_DELTA || !bars[i]) continue
        last[i] = v
        bars[i].style.transform = `scaleY(${v.toFixed(3)})`
      }
      const base = 0.15 + 0.6 * level
      if (Math.abs(base - lastBase) >= MIN_DELTA && baseRef.current) {
        lastBase = base
        baseRef.current.style.opacity = base.toFixed(3)
      }
    })
    return unsubscribe
  }, [])

  return (
    <div className="audioGlow" ref={rootRef} aria-hidden="true">
      <div className="audioGlowBase" ref={baseRef} />
      <div className="audioGlowBars">
        {BARS.map((_, i) => (
          <div key={i} className="audioGlowBar" ref={el => { barsRef.current[i] = el }} />
        ))}
      </div>
    </div>
  )
}
