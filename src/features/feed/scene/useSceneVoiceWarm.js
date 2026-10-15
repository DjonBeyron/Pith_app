import { useCallback, useEffect, useRef } from 'react'
import { sayPermission } from '../../../shared/lib/speech/sayPermission.js'
import { voiceTaskAvailable } from './sceneVoiceData.js'

// Прогрев голосового задания в ленте — НЕ на каждом слайде, а только когда панель вот-вот выедет: сцена с голосовым заданием дошла до
// последней реплики первого круга (SlideScene → useSceneTask.onState). Используем ОБЩИЙ путь раннего прогрева «Сказать фразу»
// (shared/lib/speech/sayLessonWarm.js: модель в кэше → в память через voskRuntime; не греет в режиме админа «Только системное» и в запасном режиме
// микрофона; вторая модель не появляется — владельцев считает сам runtime). Модуль грузится динамически, как в уроке (лента не тянет Vosk в основной
// бандл); заодно подгружается чанк панели (SceneVoicePanel.jsx — тоже динамический) и обновляется кэш разрешения микрофона (Permissions API,
// диалога не вызывает: отозванный доступ → панель тихо не покажется). Освобождение: слайд ушёл / панель открылась (дальше держит сама панель) / размонтирование.
/** → cancel() | null: стартовать прогрев (deps подставляются в тестах) */
export function warmVoiceTask({ perm = sayPermission, load = () => import('../../../shared/lib/speech/sayLessonWarm.js'), loadPanel = () => import('./SceneVoicePanel.jsx') } = {}) {
  if (!voiceTaskAvailable(perm)) return null
  Promise.resolve(perm.refresh?.()).catch(() => {})
  Promise.resolve(loadPanel()).catch(() => {})
  let cancelled = false
  let stop = null
  Promise.resolve(load()).then(m => { if (!cancelled) stop = m.startLessonWarm() }).catch(() => {})
  return () => { cancelled = true; stop?.(); stop = null }
}

// → start(): звать на последней реплике; сам отпускает прогрев, когда он больше не нужен
export function useSceneVoiceWarm({ voice, active, live, open }) {
  const rel = useRef(null)
  const stop = useCallback(() => { rel.current?.(); rel.current = null }, [])
  useEffect(() => { if (!(voice && active && live) || open) stop() }, [voice, active, live, open, stop])
  useEffect(() => stop, [stop])
  return useCallback(() => { if (!rel.current) rel.current = warmVoiceTask() }, [])
}
