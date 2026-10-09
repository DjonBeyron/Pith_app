import { useEffect } from 'react'
import { warmSoundFiles } from '../shared/lib/sounds.js'
// Личные настройки звука из шестерёнки урока: при загрузке регистрируют фильтр звуков (lessonPrefs.js)
import '../features/player/lessonPrefs.js'
import ShellV2 from './ShellV2.jsx'
import LessonNavOverlay from './LessonNavOverlay.jsx'
import AppPerfProbe from './AppPerfProbe.jsx'
import { useAdmin } from './AdminContext.jsx'
import { useIdlePrewarm } from './useIdlePrewarm.js'
import { useResumeHeal } from './resumeHeal.js'
import { useVoskBackground } from '../shared/lib/vosk/useVoskBackground.js'
import { confirmBoot } from '../shared/lib/shellClient.js'

// Этап 6 миграции завершён: старая оболочка вынесена в old/ (вне git и
// сборки), приложение — это новая оболочка ShellV2.
// LessonNavOverlay — полноэкранный слой перехода по ноде-ссылке (lesson_ref):
// рендерится поверх ShellV2, когда открыт (LessonNavContext.jsx)
export default function App() {
  // Прогрев чанков плеера/повторения/админки в простое после ленты (useIdlePrewarm.js)
  useIdlePrewarm(useAdmin().isRealAdmin)
  // Возврат из фона: снять остатки блокировок и проверить, что панель вкладок кликабельна (resumeHeal.js)
  useResumeHeal()
  // Тихая фоновая предзагрузка модели Vosk (≈39 МБ) в кэш — без интерфейса, только в простое (shared/lib/vosk/voskBackground.js)
  useVoskBackground()

  // Дебаг-тулбар покадровой отладки — за общим выключателем DEBUG_TOOLS_ON
  // (см. shared/lib/debugToolsEnabled.js): в репозитории он выключен, локально
  // включается строкой VITE_DEBUG_TOOLS=1 в .env.local. Значение известно на
  // этапе сборки, поэтому Vite вырезает и ветку, и сам чанк целиком
  // Звуки интерфейса — в HTTP-кэш сразу после старта (sounds.js)
  // Метка в журнале старта (Админ → «Старт»): App смонтирован (первый эффект)
  // и сообщение воркеру boot-ok: запуск из кеша оболочки удался (shellClient.js — защита от залипания кеша)
  useEffect(() => { window.__startMark?.('app-mounted'); confirmBoot() }, [])

  useEffect(() => {
    const id = setTimeout(warmSoundFiles, 2500)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    // Условие написано ЛИТЕРАЛЬНО, а не через импортированный DEBUG_TOOLS_ON:
    // Vite подставляет значения import.meta.env на этапе сборки и сворачивает
    // ветку вместе с динамическим import() только когда видит их прямо здесь.
    // Через импорт из другого модуля свёртка не срабатывает — проверено
    // сборкой: в dist/ оказывались и mountDebugTools, и rrweb целиком.
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_TOOLS === '1') {
      import('../features/debugTools/mountDebugTools.jsx').then(m => m.mountDebugTools())
    }
  }, [])

  return (
    <>
      <ShellV2 />
      <LessonNavOverlay />
      <AppPerfProbe />
    </>
  )
}
