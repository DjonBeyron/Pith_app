import { useState } from 'react'
import AdminTab from '../features/admin/AdminTab.jsx'
import UserTab from '../features/user/UserTab.jsx'
import LessonsTab from '../features/lessons/LessonsTab.jsx'
import CanvasPage from '../features/canvas/CanvasPage.jsx'
import SettingsTab from '../features/settings/SettingsTab.jsx'
import ProfileTab from '../features/profile/ProfileTab.jsx'
import AuthTab from '../features/auth/AuthTab.jsx'
import TabsNav from './TabsNav.jsx'
import { useAdmin } from './AdminContext.jsx'
import { APP_VERSION } from '../shared/lib/version.js'

export default function App() {
  const [tab, setTab] = useState('lessons')
  // { id, moduleLessons: [{id, title}] } — уроки модуля нужны редактору для привязки ответов
  const [canvasLesson, setCanvasLesson] = useState(null)
  const { isAdmin } = useAdmin()

  // Canvas editor replaces the entire layout — no tabs, full screen
  if (canvasLesson) {
    return (
      <CanvasPage
        lessonId={canvasLesson.id}
        moduleLessons={canvasLesson.moduleLessons ?? []}
        onBack={() => setCanvasLesson(null)}
      />
    )
  }

  return (
    <div className="app">
      <div className="versionBadge">v{APP_VERSION}</div>
      <TabsNav tab={tab} onSelect={setTab} isAdmin={isAdmin} />
      <div className="tabContent">
        {tab === 'profile'  && <ProfileTab />}
        {tab === 'auth'     && <AuthTab onLoginSuccess={() => setTab('profile')} />}
        {tab === 'user'     && <UserTab />}
        {tab === 'lessons'  && <LessonsTab onOpenCanvas={setCanvasLesson} />}
        {tab === 'admin'    && isAdmin && <AdminTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
