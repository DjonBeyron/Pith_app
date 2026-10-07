import { useEffect } from 'react'
import { preloadSounds } from '../../shared/lib/sounds.js'

// Схема модуля: по первому касанию страницы создаём Audio-элементы звуков
// (preloadSounds). Файлы уже в HTTP-кэше (warmSoundFiles в App.jsx), но iOS
// не грузит медиа-элемент без жеста — pointerdown и есть жест, он приходит
// за десятки мс до click. К тапу по закрытому уроку элемент уже load()-нут,
// и звук стартует сразу. Один раз за монтирование; в StrictMode-dev слушатель
// снимается и ставится заново — лишнего вызова нет, preloadSounds идемпотентен
export function usePreloadSoundsOnTap() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onTap = () => { document.removeEventListener('pointerdown', onTap, true); preloadSounds() }
    document.addEventListener('pointerdown', onTap, true)
    return () => document.removeEventListener('pointerdown', onTap, true)
  }, [])
}
