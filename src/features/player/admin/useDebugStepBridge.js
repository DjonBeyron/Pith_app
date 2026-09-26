import { useEffect } from 'react'

// Мобильный дебаг-тулбар (src/features/debugTools) читает тот же самый
// step, что и десктопная PlayerAdminPanel — просто через мост, а не через
// проп, ей ведь и на телефоне некуда отрисоваться. Только dev-сборка.
// Вынесено из LessonPlayer.jsx (тот упирался в потолок 400 строк)
export function useDebugStepBridge(step) {
  useEffect(() => {
    if (import.meta.env.DEV) import('../../debugTools/debugPlayerStep.js').then(m => m.registerPlayerStep(step))
  }) // без deps: step — новый объект на каждый рендер, актуальные функции нужны сразу
  useEffect(() => {
    return () => {
      if (import.meta.env.DEV) import('../../debugTools/debugPlayerStep.js').then(m => m.registerPlayerStep(null))
    }
  }, [])
}
