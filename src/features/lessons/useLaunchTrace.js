import { useEffect } from 'react'
import { traceLaunch, stateSignature } from '../../shared/lib/launchTrace.js'

// Хук карточки запуска: событие монтирования/размонтирования и переходы состояния условий готовности (state — плоский объект флагов и списков «не готово»)
export default function useLaunchTrace(state) {
  useEffect(() => {
    traceLaunch('карточка запуска смонтирована')
    return () => traceLaunch('карточка запуска размонтирована')
  }, [])
  const sig = stateSignature(state)
  useEffect(() => { traceLaunch(`состояние: ${sig}`) }, [sig])
}
