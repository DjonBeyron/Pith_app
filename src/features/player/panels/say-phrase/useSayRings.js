import { useEffect, useRef } from 'react'
import { initialRings, ringsStep, ringTarget } from '../../../../shared/lib/speech/sayRings.js'

const VARS = ['--say-lvl', '--say-lvl2', '--say-lvl3'] // уровни трёх колец: 0..1 (внутреннее быстрее, внешние с задержкой), масштаб/прозрачность — в CSS

// Кольца вокруг круга «Слушаю…»: пока идёт попытка (on), каждый кадр rAF пишет уровни в CSS-переменные корня круга (ref) — БЕЗ ререндеров
// React; сами кольца двигают только transform/opacity (say-phrase-mic.css). listening — уже «Слушаю…»: кольца следуют за голосом
// (voice.ringLevel, синтетический уровень по событиям распознавания); до этого, в подготовке, — только спокойное «дыхание».
// Переход подготовка → «Слушаю…» цикл не перезапускает (уровни плавно продолжаются). Время кадров (rAF) и событий
// (performance.now) — одна шкала. При «уменьшить движение» ничего не пишем: кольца неподвижны. Вне попытки цикла нет вовсе.
export function useSayRings(rootRef, { on, listening, voice }) {
  const listeningRef = useRef(listening)
  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => {
    const el = rootRef.current
    if (!on || !el) return undefined
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let raf = 0
    let last = 0
    let levels = initialRings()
    const tick = t => {
      const heard = listeningRef.current
      levels = ringsStep(levels, ringTarget({ voice: heard ? voice.ringLevel(t) : 0, t, listening: heard }), last ? t - last : 16)
      last = t
      levels.forEach((v, i) => el.style.setProperty(VARS[i], v.toFixed(3)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf) // значения остаются: кольца в это время гаснут по opacity контейнера, на следующей попытке цикл начнёт с нуля
  }, [rootRef, on, voice])
}
