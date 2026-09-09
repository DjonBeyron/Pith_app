import { useEffect } from 'react'
import ShellV2 from './ShellV2.jsx'
import LessonNavOverlay from './LessonNavOverlay.jsx'

// Этап 6 миграции завершён: старая оболочка вынесена в old/ (вне git и
// сборки), приложение — это новая оболочка ShellV2.
// LessonNavOverlay — полноэкранный слой перехода по ноде-ссылке (lesson_ref):
// рендерится поверх ShellV2, когда открыт (LessonNavContext.jsx)
export default function App() {
  // Дебаг-тулбар покадровой отладки — только dev-сборка (npm run dev):
  // import.meta.env.DEV известен на этапе сборки, Vite вырезает эту ветку и
  // сам чанк из прод-бандла целиком, см. src/features/debugTools/
  useEffect(() => {
    if (import.meta.env.DEV) {
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
