import { useEffect, useRef } from 'react'
import { subscribeAudioLevel } from './audioLevel.js'
import { startUiSoundGlow } from './soundGlow.js'
import { BARS, BAR_COUNT, barShape, baseShift } from './audioGlowShape.js'

// Свечение снизу чата урока: мягкая фиолетовая масса света у нижней кромки
// (цвет постоянной памяти, --lvlP / WIRE_COLORS.perm), реагирует на ВСЕ звуки
// урока — голосовые, слова, диктор таблиц, видео/кружок/стикер со звуком и
// звуки интерфейса (источники — audioLevel.js, soundGlow.js).
//
// Оптимизация: ни одного React-рендера во время игры — уровень приходит из
// общего rAF-цикла (≤30 кадров/с) и пишется прямо в transform/opacity узлов
// (только композитор, без Layout/Paint). В покое слой невидим
// (visibility:hidden через класс), will-change только пока играет. Запись в
// DOM — лишь если значение сдвинулось заметно (≥ MIN_DELTA).
// Форма узлов — audioGlowShape.js, раскладка — audio-glow.css
const MIN_DELTA = 0.02
const BASE_SHIFT_DELTA = 0.4   // % ширины — сдвиг подложки пишем реже

export default function AudioGlow() {
  const rootRef = useRef(null)
  const baseRef = useRef(null)
  const barsRef = useRef([])

  // Звуки интерфейса → импульсы свечения (подписка живёт вместе со слоем)
  useEffect(() => startUiSoundGlow(), [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const lastScale = new Float32Array(BAR_COUNT)
    const lastAlpha = new Float32Array(BAR_COUNT)
    let lastBase = -1
    let lastShift = 1
    let shown = false
    let hiddenTab = false

    const unsubscribe = subscribeAudioLevel((level, active, now) => {
      if (active !== shown) {
        shown = active
        // Плеер внутри скрытой вкладки оболочки — не светим и не пишем в DOM
        hiddenTab = active && !!root.closest('.shellV2TabHidden')
        root.classList.toggle('audioGlowOn', active && !hiddenTab)
        if (!active) { lastScale.fill(0); lastAlpha.fill(0); lastBase = -1; lastShift = 1 }
      }
      // prefers-reduced-motion: статичное тусклое свечение задаёт CSS
      if (!active || hiddenTab || reduced) return
      const t = now / 1000
      const bars = barsRef.current
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = bars[i]
        if (!bar) continue
        const { scale, alpha } = barShape(i, level, t)
        if (Math.abs(scale - lastScale[i]) >= MIN_DELTA) {
          lastScale[i] = scale
          bar.style.transform = `scaleY(${scale.toFixed(3)})`
        }
        if (Math.abs(alpha - lastAlpha[i]) >= MIN_DELTA) {
          lastAlpha[i] = alpha
          bar.style.opacity = alpha.toFixed(3)
        }
      }
      const base = baseRef.current
      if (!base) return
      const baseAlpha = 0.2 + 0.6 * level
      if (Math.abs(baseAlpha - lastBase) >= MIN_DELTA) {
        lastBase = baseAlpha
        base.style.opacity = baseAlpha.toFixed(3)
      }
      const shift = baseShift(t)
      if (Math.abs(shift - lastShift) >= BASE_SHIFT_DELTA) {
        lastShift = shift
        base.style.transform = `translateX(${shift.toFixed(1)}%)`
      }
    })
    return unsubscribe
  }, [])

  return (
    <div className="audioGlow" ref={rootRef} aria-hidden="true">
      <div className="audioGlowBase" ref={baseRef} />
      <div className="audioGlowBars">
        {BARS.map((b, i) => (
          <div
            key={i}
            className="audioGlowBar"
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
            ref={el => { barsRef.current[i] = el }}
          />
        ))}
      </div>
    </div>
  )
}
