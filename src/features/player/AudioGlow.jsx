import { useEffect, useRef } from 'react'
import { subscribeAudioLevel } from './audioLevel.js'
import { startUiSoundGlow } from './soundGlow.js'
import { POINTS, glowContour, contourDelta } from './audioGlowShape.js'

// Свечение снизу чата урока: цельная фиолетовая масса света у нижней кромки
// (цвет постоянной памяти, --lvlP / WIRE_COLORS.perm), выше у левого и
// правого углов, ниже в центре; низкие частоты — в углах, средние/высокие —
// в центре. Реагирует на ВСЕ звуки урока — источники в audioLevel.js
// (спектр — shared/lib/audioSpectrum.js), звуки интерфейса — soundGlow.js.
//
// Один <canvas> низкого разрешения (W×H), растянутый CSS на всю ширину —
// билинейное сглаживание прячет ступеньки, а залитый гладкий контур = ни
// одного шва. Ни одного React-рендера во время игры: уровень и полосы
// приходят из общего rAF-цикла (≤30 к/с), перерисовка лишь если контур
// сдвинулся заметно (≥ MIN_DELTA). Размер и градиенты — один раз; никаких
// filter/blur/shadowBlur. В покое слой скрыт (visibility), rAF нет, canvas
// не трогаем. Раскладка — audioGlowShape.js, стили — audio-glow.css
const W = 192, H = 56
const MIN_DELTA = 0.015
const SHADE_PX_PER_S = 14   // скорость «гуляющей» яркости по горизонтали

export default function AudioGlow() {
  const rootRef   = useRef(null)
  const canvasRef = useRef(null)

  // Звуки интерфейса → импульсы свечения (подписка живёт вместе со слоем)
  useEffect(() => startUiSoundGlow(), [])

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current
    if (!root || !canvas) return
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!ctx) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const paint = makePainter(ctx)
    const contour = new Float32Array(POINTS)
    const last = new Float32Array(POINTS)
    let shown = false
    let hiddenTab = false
    let staticDrawn = false

    const unsubscribe = subscribeAudioLevel((level, active, now, bands) => {
      if (active !== shown) {
        shown = active
        // Плеер внутри скрытой вкладки оболочки — не светим и не рисуем
        hiddenTab = active && !!root.closest('.shellV2TabHidden')
        root.classList.toggle('audioGlowOn', active && !hiddenTab)
        // Погасли: последний кадр остаётся под CSS-затуханием; новый старт
        // рисует с нуля
        if (active) last.fill(-1)
      }
      if (!active || hiddenTab) return
      // Меньше движения: одна статичная тусклая полоса на всё время звука
      if (reduced) {
        if (!staticDrawn) { staticDrawn = true; paint(glowContour(STATIC_BANDS, 0, contour), 0, 0.4) }
        return
      }
      const t = now / 1000
      glowContour(bands, t, contour)
      if (contourDelta(contour, last) < MIN_DELTA) return
      last.set(contour)
      paint(contour, t, level)
    })
    return unsubscribe
  }, [])

  return (
    <div className="audioGlow" ref={rootRef} aria-hidden="true">
      <canvas className="audioGlowCanvas" ref={canvasRef} width={W} height={H} />
    </div>
  )
}

const STATIC_BANDS = new Float32Array([0.5, 0.5, 0.5, 0.5])

// Слои одного контура с масштабом высоты: накопление source-over с низкой
// альфой даёт спад прозрачности относительно ЛОКАЛЬНОЙ высоты в каждой точке
// — верх контура тает в прозрачность везде (и в низком центре, и в высоких
// углах), без видимой границы-линии; ступени между слоями билинейное
// растягивание сглаживает. Самый верхний слой — ≈ LAYER_ALPHA × градиент
const LAYERS = [1, 0.82, 0.64, 0.47, 0.31, 0.16]
const LAYER_ALPHA = 0.2

// Градиенты создаются один раз; рисование — LAYERS заливок одного гладкого
// контура (квадратичные дуги через середины отрезков) вертикальным
// градиентом от яркого низа к прозрачному верху + проход source-atop с
// периодичным горизонтальным затемнением, сдвигаемым по времени, —
// «гуляющая» яркость без filter
function makePainter(ctx) {
  const fill = ctx.createLinearGradient(0, H, 0, 0)
  fill.addColorStop(0,    'rgba(167, 139, 250, 0.95)')  // #a78bfa у кромки
  fill.addColorStop(0.35, 'rgba(139, 92, 246, 0.6)')    // #8b5cf6
  fill.addColorStop(0.7,  'rgba(139, 92, 246, 0.25)')
  fill.addColorStop(1,    'rgba(139, 92, 246, 0)')
  const shade = ctx.createLinearGradient(0, 0, 2 * W, 0)
  for (let i = 0; i <= 8; i++) shade.addColorStop(i / 8, `rgba(20, 10, 40, ${i % 2 ? 0.26 : 0})`)
  const step = W / (POINTS - 1)

  const contourPath = (c, s) => {
    ctx.beginPath()
    ctx.moveTo(0, H)
    ctx.lineTo(0, H - c[0] * s * H)
    for (let i = 1; i < POINTS; i++) {
      ctx.quadraticCurveTo((i - 1) * step, H - c[i - 1] * s * H, (i - 0.5) * step, H - (c[i - 1] + c[i]) * 0.5 * s * H)
    }
    ctx.lineTo(W, H - c[POINTS - 1] * s * H)
    ctx.lineTo(W, H)
    ctx.closePath()
  }

  return (c, t, level) => {
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = LAYER_ALPHA * (0.6 + 0.4 * level)
    ctx.fillStyle = fill
    for (const s of LAYERS) { contourPath(c, s); ctx.fill() }
    // Горизонтальная «гуляющая» яркость: узор периодичен по W, сдвиг по кругу
    ctx.globalCompositeOperation = 'source-atop'
    ctx.globalAlpha = 1
    ctx.save()
    ctx.translate(-((t * SHADE_PX_PER_S) % W), 0)
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, 2 * W, H)
    ctx.restore()
    ctx.globalCompositeOperation = 'source-over'
  }
}
