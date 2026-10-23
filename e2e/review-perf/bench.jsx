// Стенд e2e «Разбор урока»: LessonReviewPanel на настоящем уроке из lesson-drafts/<имя>.json (?lesson=im|at), импорт тем же importLesson,
// что и в приложении. boardApiRef — заглушка основного холста (разбору нужны getNodes/updateNode только для «Применить»)
import { createRoot } from 'react-dom/client'
import { AdminProvider } from '../../src/app/AdminContext.jsx'
import { LessonNavProvider } from '../../src/app/LessonNavContext.jsx'
import LessonReviewPanel from '../../src/features/canvas/review/LessonReviewPanel.jsx'
import { importLesson } from '../../src/features/canvas/lesson-io/importLesson.js'
import '../../src/index.css'

const name = new URLSearchParams(location.search).get('lesson') ?? 'im'
const json = await (await fetch(`/lesson-drafts/${name}.json`)).json()
const imp = importLesson(json)
const boardApiRef = { current: { getNodes: () => imp.nodes, updateNode: () => {} } }
window.__bench = { nodes: imp.nodes.length }
createRoot(document.getElementById('root')).render(
  <AdminProvider>
    <LessonNavProvider>
      <LessonReviewPanel nodes={imp.nodes} zones={imp.zones ?? []} boardApiRef={boardApiRef} storageId="bench-review" teacherName="Пит" boardProps={{ lessonFiles: [] }} onClose={() => { window.__bench.closed = true }} />
    </LessonNavProvider>
  </AdminProvider>,
)
