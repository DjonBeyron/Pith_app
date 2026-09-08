import ShellV2 from './ShellV2.jsx'
import LessonNavOverlay from './LessonNavOverlay.jsx'

// Этап 6 миграции завершён: старая оболочка вынесена в old/ (вне git и
// сборки), приложение — это новая оболочка ShellV2.
// LessonNavOverlay — полноэкранный слой перехода по ноде-ссылке (lesson_ref):
// рендерится поверх ShellV2, когда открыт (LessonNavContext.jsx)
export default function App() {
  return (
    <>
      <ShellV2 />
      <LessonNavOverlay />
    </>
  )
}
