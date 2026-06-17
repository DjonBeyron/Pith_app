import { useState } from 'react'
import AdminTab from '../features/admin/AdminTab.jsx'
import UserTab from '../features/user/UserTab.jsx'
import LessonsTab from '../features/lessons/LessonsTab.jsx'
import { APP_VERSION } from '../shared/lib/version.js'

export default function App() {
  const [tab, setTab] = useState('user')
  const [canvasLessonId, setCanvasLessonId] = useState(null)

  // Canvas editor opens as a full-screen page on top of the tab layout (Stage 2)
  if (canvasLessonId) {
    return (
      <div className="app">
        <div className="canvasStub">
          <button onClick={() => setCanvasLessonId(null)}>← Назад к урокам</button>
          <div className="canvasStubHint">Редактор урока — скоро здесь</div>
          <div className="canvasStubId">ID: {canvasLessonId}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="versionBadge">v{APP_VERSION}</div>
      <div className="tabs">
        <button
          className={tab === 'user' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('user')}
        >
          Пользователь
        </button>
        <button
          className={tab === 'lessons' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('lessons')}
        >
          Уроки
        </button>
        <button
          className={tab === 'admin' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('admin')}
        >
          Админ
        </button>
      </div>
      {tab === 'user'    && <UserTab />}
      {tab === 'lessons' && <LessonsTab onOpenCanvas={setCanvasLessonId} />}
      {tab === 'admin'   && <AdminTab />}
    </div>
  )
}
