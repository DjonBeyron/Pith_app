import { useLayoutEffect } from 'react'
import { restRings, ringsStep, ringTarget, ringFrame, eqEnvelope } from '../../../../shared/lib/speech/sayRings.js'

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
// (restRings: уровень «дыхания», прозрачность 0), дальше кольца «дышат» (ringTarget), следуют за уровнем и ПЛАВНО проявляются за EQ_FADE_MS (eqEnvelope: без «включения на ходу» поверх волн активации). Радиус каждого
// кольца обрезан по контейнеру (ringFrame → clampRadius): размеры меряем при старте и на resize/смене ориентации. Источник уровня заменяем
// (синтетический по событиям / реальный RMS / Vosk) — хук о нём ничего не знает. «Уменьшить движение»: цикла нет, кольца неподвижны (CSS).
// Вне записи цикла нет вовсе; значения колец остаются, пока слой гаснет по opacity (SayStage / say-phrase-waves.css).
export function useSayWaves({ eqRef, clipRef, anchorRef }, { on, source }) {
  useLayoutEffect(() => {
    const eq = eqRef.current
    if (!on || !eq || !source || reducedMotion()) return undefined
    const rings = [...eq.children]
    let box = measure(clipRef.current, anchorRef.current)
    let levels = restRings()
    let last = 0
    const t0 = performance.now() // шкала rAF-меток и performance.now одна: отсчёт проявления от тапа
    const paint = (t = t0) => rings.forEach((el, i) => {
      const f = ringFrame(levels[i], i, box, eqEnvelope(t - t0))
      el.style.transform = `scale(${f.scale.toFixed(3)})`
      el.style.opacity = f.opacity.toFixed(3)
    })
    const remeasure = () => { box = measure(clipRef.current, anchorRef.current) }
    paint()
    window.addEventListener('resize', remeasure)
    const unsubscribe = source.subscribe((level, t) => {
      levels = ringsStep(levels, ringTarget({ voice: level, t }), last ? t - last : 16)
      last = t
      paint(t)
    })
    return () => { unsubscribe(); window.removeEventListener('resize', remeasure) }
  }, [on, source, eqRef, clipRef, anchorRef])
}
