import { useState } from 'react'
import AdminTab from '../features/admin/AdminTab.jsx'
import UserTab from '../features/user/UserTab.jsx'
import LessonsTab from '../features/lessons/LessonsTab.jsx'
import CanvasPage from '../features/canvas/CanvasPage.jsx'
import SettingsTab from '../features/settings/SettingsTab.jsx'
import ProfileTab from '../features/profile/ProfileTab.jsx'
import AuthTab from '../features/auth/AuthTab.jsx'
import { APP_VERSION } from '../shared/lib/version.js'

export default function App() {
  const [tab, setTab] = useState('lessons')
  const [canvasLessonId, setCanvasLessonId] = useState(null)

  // Canvas editor replaces the entire layout — no tabs, full screen
  if (canvasLessonId) {
    return <CanvasPage lessonId={canvasLessonId} onBack={() => setCanvasLessonId(null)} />
  }

  return (
    <div className="app">
      <div className="versionBadge">v{APP_VERSION}</div>
      <div className="tabs">
        <button
          className={tab === 'profile' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('profile')}
        >
          Профиль
        </button>
        <button
          className={tab === 'auth' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('auth')}
        >
          Войти
        </button>
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
        <button
          className={tab === 'settings' ? 'tabBtn tabBtnActive' : 'tabBtn'}
          onClick={() => setTab('settings')}
        >
          Настройки
        </button>
      </div>
      {tab === 'profile'  && <ProfileTab />}
      {tab === 'auth'     && <AuthTab onLoginSuccess={() => setTab('profile')} />}
      {tab === 'user'     && <UserTab />}
      {tab === 'lessons'  && <LessonsTab onOpenCanvas={setCanvasLessonId} />}
      {tab === 'admin'    && <AdminTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}
