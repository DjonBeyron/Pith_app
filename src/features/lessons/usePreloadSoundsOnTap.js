import { useEffect } from 'react'
import { preloadSounds } from '../../shared/lib/sounds.js'

// Схема модуля: по первому ТАПУ страницы создаём Audio-элементы звуков
// (preloadSounds). Файлы уже в HTTP-кэше (warmSoundFiles в App.jsx), но iOS
// не грузит медиа-элемент без жеста — окончание касания и есть жест, он
// приходит прямо перед click, и к тапу по закрытому уроку элемент уже
// создан. Один раз за монтирование; в StrictMode-dev слушатель снимается и
// ставится заново — лишнего вызова нет, preloadSounds идемпотентен.
//
// Раньше это было на pointerdown: девять Audio + AudioContext создавались в
// момент касания, ровно когда палец начинает листать схему, — на слабом
// Android 100–300 мс главного потока, и первая прокрутка «не бралась». Теперь
// по окончании касания и только если оно было тапом: прокрутка заканчивается
// pointercancel (pointerup нет), а touchend после неё всё же приходит — его
// отсекаем по смещению пальца. Тап по закрытому уроку и так вызывает
// preloadSounds() сам (ModuleGraph.handleClick, прямо в жесте)
const TAP_SLOP_PX = 10

export function usePreloadSoundsOnTap() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    let sx = 0, sy = 0
    const onDown = e => { sx = e.clientX; sy = e.clientY }
    const off = () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('touchend', onEnd, true)
    }
    const fire = () => { off(); preloadSounds() }
    const onUp = e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) <= TAP_SLOP_PX) fire() }
    const onEnd = e => {
      const t = e.changedTouches?.[0]
      if (t && Math.hypot(t.clientX - sx, t.clientY - sy) <= TAP_SLOP_PX) fire()
    }
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('touchend', onEnd, true)
    return off
  }, [])
}
