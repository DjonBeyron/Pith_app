// Стенд e2e «лента рекомендаций»: настоящая FeedTab (Swiper, слайды, пул видео, прогрев соседей) без оболочки приложения.
// Модули — из curriculaApiStub.js (подстановка vite.config.js), остальной бэкенд мёртв по плану
import { createRoot } from 'react-dom/client'
import { AdminProvider } from '../../src/app/AdminContext.jsx'
import { LessonNavProvider } from '../../src/app/LessonNavContext.jsx'
import FeedTab from '../../src/features/feed/FeedTab.jsx'
import '../../src/index.css'

createRoot(document.getElementById('root')).render(
  <AdminProvider>
    <LessonNavProvider>
      <div className="shellV2Content" style={{ position: 'fixed', inset: 0 }}>
        <div className="shellV2Tab">
          <FeedTab visible onOpenCanvas={() => {}} onRequireAuth={() => {}} learnView={null} onLearnChanged={() => {}} />
        </div>
      </div>
    </LessonNavProvider>
  </AdminProvider>,
)
