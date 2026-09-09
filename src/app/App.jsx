import { useEffect } from 'react'
import ShellV2 from './ShellV2.jsx'
import LessonNavOverlay from './LessonNavOverlay.jsx'

// Этап 6 миграции завершён: старая оболочка вынесена в old/ (вне git и
// сборки), приложение — это новая оболочка ShellV2.
// LessonNavOverlay — полноэкранный слой перехода по ноде-ссылке (lesson_ref):
// рендерится поверх ShellV2, когда открыт (LessonNavContext.jsx)
export default function App() {
  // Дебаг-тулбар покадровой отладки — за общим выключателем DEBUG_TOOLS_ON
  // (см. shared/lib/debugToolsEnabled.js): в репозитории он выключен, локально
  // включается строкой VITE_DEBUG_TOOLS=1 в .env.local. Значение известно на
  // этапе сборки, поэтому Vite вырезает и ветку, и сам чанк целиком
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
    </>
  )
}
