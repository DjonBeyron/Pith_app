import { loudestFrameIndex } from './audioWaveParts.js'

// Стоп-кадр спектра ДО первого плея — центр не индекс 0 (часто тишина/вдох
// перед речью, кадр выглядел плоским), а САМАЯ ГРОМКАЯ точка записи. На
// слабых устройствах tick() вообще не пересчитывает полоски во время игры
// (fi=-1 всегда) — значит этот кадр виден не долю секунды до старта, а ВСЮ
// игру целиком. Тот же формат разброса ±offset*0.2, что и у живого
// эквалайзера в tick(), просто центр не всегда 0.
export function applyFirstAudioFrame(wd, barElsRef, barSmoothRef) {
  if (!wd?.length) return
  const n      = barElsRef.current.length
  const center = (n - 1) / 2
  const peakIdx = loudestFrameIndex(wd)
  barElsRef.current.forEach((bar, i) => {
    if (!bar) return
    const offset = Math.round((i - center) * 0.2)
    const idx    = Math.max(0, Math.min(wd.length - 1, peakIdx + offset))
    const amp    = Math.pow(wd[idx] / 255, 0.55)
    barSmoothRef.current[i] = amp
    bar.style.transform = `scaleY(${Math.max(0.1, amp * 1.8)})`
  })
}
