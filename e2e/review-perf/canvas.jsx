// Стенд e2e «Страница канваса»: настоящий CanvasPage (как в приложении, поверх оболочки), урок приходит запросом к lessons — его отдаёт тест
import { createRoot } from 'react-dom/client'
import { AdminProvider } from '../../src/app/AdminContext.jsx'
import { LessonNavProvider } from '../../src/app/LessonNavContext.jsx'
import CanvasPage from '../../src/features/canvas/CanvasPage.jsx'
import '../../src/index.css'

window.__bench = { t0: performance.now() }
createRoot(document.getElementById('root')).render(
  <AdminProvider>
    <LessonNavProvider>
      <div className="shellV2CanvasOverlay">
        <CanvasPage lessonId="bench-lesson" moduleLessons={[]} module={null} onBack={() => {}} onOpenProduction={() => {}} onOpenCards={() => {}} onOpenWordCard={() => {}} />
      </div>
    </LessonNavProvider>
  </AdminProvider>,
)
