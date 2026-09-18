import { useLayoutEffect } from 'react'
import { BAR_W, BAR_GAP } from './audioWaveParts.js'

// Плотность полосок волны подстраивается под РЕАЛЬНУЮ ширину дорожки —
// сколько баров (BAR_W+BAR_GAP каждый) в неё физически влезает. Обновляем
// только когда ширина ДЕЙСТВИТЕЛЬНО поменялась (не на каждый ResizeObserver
// тик — их бывает лишний, например от монтирования текста/смены класса).
//
// useLayoutEffect, а НЕ useEffect: первая (синхронная) поправка barCount
// должна случиться ДО того, как браузер покажет кадр — иначе дефолтный
// barCount (WAVE_H_BASE.length) рисуется на первом кадре, а через мгновение
// подменяется реальным, и это ЛИШНЯЯ смена ширины дорожки волны, которую
// PlayerBubble.jsx ловит своим ResizeObserver и норовит анимировать как
// «пузырь перестраивается» — тот самый баг, который правили несколько
// раз подряд, но по частям (см. PROJECT.md).
export function useAdaptiveBarCount({
  waveRowRef, prevBarCountRef, barSmoothRef, barElsRef, setBarCount,
}) {
  useLayoutEffect(() => {
    const el = waveRowRef.current
    if (!el) return
    const update = () => {
      const count = Math.max(8, Math.floor(el.offsetWidth / (BAR_W + BAR_GAP)))
      if (count === prevBarCountRef.current) return  // same width → skip reset entirely
      // Width genuinely changed: carry over smooth values proportionally
      const prev = prevBarCountRef.current
      barSmoothRef.current = Array.from({ length: count },
        (_, i) => barSmoothRef.current[Math.floor(i / count * prev)] || 0
      )
      prevBarCountRef.current = count
      barElsRef.current = []
      setBarCount(count)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
