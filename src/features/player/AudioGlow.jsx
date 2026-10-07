import { useEffect, useRef } from 'react'
import { subscribeAudioLevel } from './audioLevel.js'
import { startUiSoundGlow } from './soundGlow.js'
import {
  POINTS, CANVAS_W as W, CANVAS_H as H, glowContour, contourDelta, contourPeak, pointX, pointY,
} from './audioGlowShape.js'

// Свечение в нижних углах чата урока: два зеркальных фиолетовых «облака»
// (цвет постоянной памяти, --lvlP / WIRE_COLORS.perm), прижатых к нижнему
// левому и правому углам; заходят вверх вдоль боковой стороны и немного
// внутрь по низу, в центре низа пусто. Форма следует спектру: низкие частоты —
// ядро в углу, средние — вылет вверх, высокие — верхушка (audioGlowShape.js).
// Реагирует на ВСЕ звуки урока — источники в audioLevel.js (спектр —
// shared/lib/audioSpectrum.js), звуки интерфейса — soundGlow.js.
//
// Два маленьких <canvas> (W×H каждый), растянутых CSS до ≈ 68×150 px —
// билинейное сглаживание прячет ступеньки. Рисуется ОДИН (левый), правый —
// его зеркальная копия через drawImage. Ни одного React-рендера во время
// игры: уровень и полосы приходят из общего rAF-цикла (≤30 к/с), перерисовка
// лишь если контур сдвинулся заметно (≥ MIN_DELTA). Размер canvas фиксирован;
// никаких filter/blur/shadowBlur. В покое слой скрыт (visibility), rAF нет,
// canvas не трогаем. Стили — audio-glow.css
const MIN_DELTA = 0.015

export default function AudioGlow() {
  const rootRef  = useRef(null)
  const leftRef  = useRef(null)
  const rightRef = useRef(null)

  // Звуки интерфейса → импульсы свечения (подписка живёт вместе со слоем)
  useEffect(() => startUiSoundGlow(), [])

  useEffect(() => {
    const root = rootRef.current, left = leftRef.current, right = rightRef.current
    if (!root || !left || !right) return
    // БЕЗ desynchronized: на Android Chrome он даёт непрозрачный чёрный фон
    const ctx = left.getContext('2d', { alpha: true })
    const ctxR = right.getContext('2d', { alpha: true })
    if (!ctx || !ctxR) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const paint = makePainter(ctx, ctxR, left)
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
      // Меньше движения: одна статичная тусклая «L»-форма на всё время звука
      if (reduced) {
        if (!staticDrawn) { staticDrawn = true; paint(glowContour(STATIC_BANDS, 0, contour)) }
        return
      }
      glowContour(bands, now / 1000, contour)
      if (contourDelta(contour, last) < MIN_DELTA) return
      last.set(contour)
      paint(contour)
    })
    return unsubscribe
  }, [])

  return (
    <div className="audioGlow" ref={rootRef} aria-hidden="true">
      <canvas className="audioGlowCanvas audioGlowCanvasL" ref={leftRef} width={W} height={H} />
      <canvas className="audioGlowCanvas audioGlowCanvasR" ref={rightRef} width={W} height={H} />
    </div>
  )
}

const STATIC_BANDS = new Float32Array([0.5, 0.5, 0.35, 0.25])

// Слои одного контура с масштабом: накопление source-over даёт мягкую кромку
// и спад прозрачности по высоте — у низа экрана перекрываются все 6 слоёв
// (≈ 90 % непрозрачности), у верхней точки амплитуды — только самый внешний
// (≈ 5 %). Альфа слоя меняется по вертикали (градиент от низа к ВЕРХУ ТЕКУЩЕГО
// контура): 0.32 → 0.20 → 0.09 → 0.05 ⇒ суммарно по краю ≈ .90 / .59 / .17 / .05
const LAYERS = [1, 0.82, 0.64, 0.47, 0.31, 0.16]
const GRADIENT = [
  [0,    'rgba(167, 139, 250, 0.32)'],   // #a78bfa у кромки экрана
  [0.35, 'rgba(139, 92, 246, 0.20)'],    // #8b5cf6
  [0.7,  'rgba(139, 92, 246, 0.09)'],
  [1,    'rgba(139, 92, 246, 0.05)'],
]

// Левый canvas рисуем сами (6 заливок гладкого контура: квадратичные дуги
// через середины отрезков), правый — зеркальная копия через drawImage.
// clearRect перед каждой отрисовкой — прозрачность вне свечения. Один
// createLinearGradient на кадр: он растянут по пику текущего контура
function makePainter(ctx, ctxR, source) {
  const contourPath = (c, s) => {
    ctx.beginPath()
    ctx.moveTo(0, H)
    let px = pointX(c[0] * s, 0) * W, py = H - pointY(c[0] * s, 0) * H
    ctx.lineTo(px, py)
    for (let i = 1; i < POINTS; i++) {
      const x = pointX(c[i] * s, i) * W, y = H - pointY(c[i] * s, i) * H
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2)
      px = x; py = y
    }
    ctx.lineTo(px, py)
    ctx.closePath()
  }

  return c => {
    const peak = Math.max(contourPeak(c), 0.05)
    const grad = ctx.createLinearGradient(0, H, 0, H * (1 - peak))
    for (const [offset, color] of GRADIENT) grad.addColorStop(offset, color)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = grad
    for (const s of LAYERS) { contourPath(c, s); ctx.fill() }
    ctxR.clearRect(0, 0, W, H)
    ctxR.setTransform(-1, 0, 0, 1, W, 0)
    ctxR.drawImage(source, 0, 0)
    ctxR.setTransform(1, 0, 0, 1, 0, 0)
  }
}
