import { useEffect } from 'react'

// Мобильный дебаг-тулбар (src/features/debugTools, dev) и админский «скипер» (PlayerSkipper.jsx, прод) читают тот же самый
// step, что и десктопная PlayerAdminPanel — просто через мост (debugPlayerStep.js), а не через проп: им на телефоне
// некуда отрисоваться из LessonPlayer. Регистрация всегда (раньше только dev — скиперу нужна и в проде).
// Вынесено из LessonPlayer.jsx (тот упирался в потолок 400 строк)
export function useDebugStepBridge(step) {
  useEffect(() => {
    import('../../debugTools/debugPlayerStep.js').then(m => m.registerPlayerStep(step))
  }) // без deps: step — новый объект на каждый рендер, актуальные функции нужны сразу
  useEffect(() => {
    return () => {
      import('../../debugTools/debugPlayerStep.js').then(m => m.registerPlayerStep(null))
    }
  }, [])
}
