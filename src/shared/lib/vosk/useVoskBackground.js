import { useEffect } from 'react'
import { startBackground, abortBackground } from './voskBackground.js'
import { scheduleBackgroundStart } from './voskBgSchedule.js'

// Подключается ОДИН раз в App.jsx. Тихо запускает фоновую предзагрузку модели Vosk в кэш (график старта — voskBgSchedule.js,
// все условия «можно ли качать» — voskBackground.js). Ничего не рисует и не принимает параметров.
export function useVoskBackground() {
  useEffect(() => {
    const cancel = scheduleBackgroundStart(() => startBackground())
    return () => { cancel(); abortBackground() }
  }, [])
}
