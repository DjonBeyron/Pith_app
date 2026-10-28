// Стенд e2e «медиа в чате»: настоящий LessonPlayer с синтетическим уроком (lesson.js), без карточки запуска и бэкенда.
// Supabase у dev-сервера «мёртвый» (playwright.config.js) — запросы профиля/результатов падают сразу, плеер это переживает
import { createRoot } from 'react-dom/client'
import { AdminProvider } from '../../src/app/AdminContext.jsx'
import { LessonNavProvider } from '../../src/app/LessonNavContext.jsx'
import LessonPlayer from '../../src/features/player/LessonPlayer.jsx'
import { buildBenchLesson } from './lesson.js'
import '../../src/index.css'

const base = new URLSearchParams(location.search).get('media') ?? ''
const { nodes, files } = buildBenchLesson(base)
createRoot(document.getElementById('root')).render(
  <AdminProvider>
    <LessonNavProvider>
      <LessonPlayer nodes={nodes} files={files} lessonId="bench" lessonTitle="Стенд" teacherName="Пит" onClose={() => {}} />
    </LessonNavProvider>
  </AdminProvider>,
)
