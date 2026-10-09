import { useLayoutEffect } from 'react'
import { kickRings, ringsStep, ringTarget, ringFrame } from '../../../../shared/lib/speech/sayRings.js'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Размеры контейнера волн и центр круга внутри него (для clampRadius): оба прямоугольника меряются в один момент, поэтому сдвиг/подъём панели
// (transform) на разность не влияет
function measure(clip, anchor) {
  if (!clip || !anchor) return null
  const c = clip.getBoundingClientRect()
  const a = anchor.getBoundingClientRect()
  return { width: c.width, height: c.height, cx: a.left + a.width / 2 - c.left, cy: a.top + a.height / 2 - c.top }
}

// Живой эквалайзер вокруг круга-микрофона: пока идёт запись (on), КАЖДЫЙ кадр rAF общего источника уровня (sayLevelSource.js) пересчитывает три
// кольца и пишет transform/opacity ПРЯМО в style элементов — без setState и ререндеров React. Первый кадр рисуется синхронно в layout-эффекте тапа
// (kickRings: «вспышка» в том же кадре, до первого события распознавания), дальше кольца «дышат» (ringTarget) и следуют за уровнем. Радиус каждого
// кольца обрезан по контейнеру (ringFrame → clampRadius): размеры меряем при старте и на resize/смене ориентации. Источник уровня заменяем
// (синтетический по событиям / реальный RMS / Vosk) — хук о нём ничего не знает. «Уменьшить движение»: цикла нет, кольца неподвижны (CSS).
// Вне записи цикла нет вовсе; значения колец остаются, пока слой гаснет по opacity (SayStage / say-phrase-waves.css).
export function useSayWaves({ eqRef, clipRef, anchorRef }, { on, source }) {
  useLayoutEffect(() => {
    const eq = eqRef.current
    if (!on || !eq || !source || reducedMotion()) return undefined
    const rings = [...eq.children]
    let box = measure(clipRef.current, anchorRef.current)
    let levels = kickRings()
    let last = 0
    const paint = () => rings.forEach((el, i) => {
      const f = ringFrame(levels[i], i, box)
      el.style.transform = `scale(${f.scale.toFixed(3)})`
      el.style.opacity = f.opacity.toFixed(3)
    })
    const remeasure = () => { box = measure(clipRef.current, anchorRef.current) }
    paint()
    window.addEventListener('resize', remeasure)
    const unsubscribe = source.subscribe((level, t) => {
      levels = ringsStep(levels, ringTarget({ voice: level, t }), last ? t - last : 16)
      last = t
      paint()
    })
    return () => { unsubscribe(); window.removeEventListener('resize', remeasure) }
  }, [on, source, eqRef, clipRef, anchorRef])
}
