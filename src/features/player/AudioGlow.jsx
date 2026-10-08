import { useEffect, useRef } from 'react'
import { subscribeAudioLevel } from './audioLevel.js'
import { startUiSoundGlow } from './soundGlow.js'
import {
  POINTS, ARC_FIRST, ARC_LAST, CANVAS_W as W, CANVAS_H as H, CSS_H, SCALE, OX, OY, glowContour, contourDelta, innerX, innerY,
} from './audioGlowShape.js'
import { LAYERS } from './audioGlowLayers.js'

// Свечение в нижних углах чата урока: тонкая фиолетовая КАЙМА (цвет
// постоянной памяти, --lvlP / WIRE_COLORS.perm) вдоль края экрана, идущая по
// скруглению угла телефона и продолжающаяся прямыми участками вверх по боковой
// кромке и внутрь по низу; левый и правый углы зеркальны. Тихий звук — базовая
// заполненная дуга (угол «сформирован»), громкий — толщина растёт внутрь,
// вылет вверх до ≈143 px; полосы спектра задают форму (audioGlowShape.js).
// Реагирует на ВСЕ звуки урока — источники в audioLevel.js (спектр —
// shared/lib/audioSpectrum.js), звуки интерфейса — soundGlow.js.
//
// Два маленьких <canvas> (48×75, растянуты CSS до 96×150 — билинейное
// сглаживание прячет ступеньки). Рисуется ОДИН (левый), правый — его
// зеркальная копия через drawImage. Ни одного React-рендера во время игры:
// уровень и полосы приходят из общего rAF-цикла (≤30 к/с), перерисовка лишь
// если контур сдвинулся заметно (≥ MIN_DELTA, 0.02 ≈ 0.8 px толщины). Размер canvas фиксирован;
// никаких filter/blur/shadowBlur/градиентов. В покое слой скрыт (visibility),
// rAF нет, canvas не трогаем. Стили — audio-glow.css
const MIN_DELTA = 0.02

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

// Левый canvas рисуем сами: LAYER_COUNT слоёв каймы (audioGlowLayers.js), каждый —
// замкнутый путь «внешняя кромка экрана → внутренняя граница назад» с
// толщиной × scale слоя; внутренняя граница — квадратичные дуги через
// середины отрезков. Накопление слоёв даёт альфу ≈ 0.90 у кромки → 0.05 внутри.
// Правый — зеркальная копия через drawImage. clearRect перед каждой отрисовкой
function makePainter(ctx, ctxR, source) {
  const cx = x => x * SCALE
  const cy = y => (CSS_H - y) * SCALE

  const layerPath = (c, s) => {
    ctx.beginPath()
    ctx.moveTo(cx(OX[0]), cy(OY[0]))
    // Внешняя граница — по кромке экрана до ПРЯМОГО угла (не по дуге скругления): иначе на Android с прямыми
    // углами вьюпорта между дугой и углом остаётся чёрный клин, похожий на имитацию скругления
    for (let i = 1; i < ARC_FIRST; i++) ctx.lineTo(cx(OX[i]), cy(OY[i]))   // боковая прямая вниз
    ctx.lineTo(cx(0), cy(0))                                              // угол экрана
    for (let i = ARC_LAST + 1; i < POINTS; i++) ctx.lineTo(cx(OX[i]), cy(OY[i]))   // нижняя прямая внутрь
    let px = cx(innerX(c, POINTS - 1, s)), py = cy(innerY(c, POINTS - 1, s))
    ctx.lineTo(px, py)
    for (let i = POINTS - 2; i >= 0; i--) {                              // назад по внутренней границе
      const x = cx(innerX(c, i, s)), y = cy(innerY(c, i, s))
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2)
      px = x; py = y
    }
    ctx.lineTo(px, py)
    ctx.closePath()
  }

  return c => {
    ctx.clearRect(0, 0, W, H)
    for (const layer of LAYERS) {
      ctx.fillStyle = layer.color
      layerPath(c, layer.scale)
      ctx.fill()
    }
    ctxR.clearRect(0, 0, W, H)
    ctxR.setTransform(-1, 0, 0, 1, W, 0)
    ctxR.drawImage(source, 0, 0)
    ctxR.setTransform(1, 0, 0, 1, 0, 0)
  }
}
