import { useState, useEffect } from 'react'
import FeedTab from '../features/feed/FeedTab.jsx'
import ProfileV2 from '../features/profile/ProfileV2.jsx'
import AuthTab from '../features/auth/AuthTab.jsx'
import AdminV2 from '../features/admin/AdminV2.jsx'
import CanvasPage from '../features/canvas/CanvasPage.jsx'
import EnergyBadge from './EnergyBadge.jsx'
import { useAdmin } from './AdminContext.jsx'
import { useAuth } from '../shared/lib/useAuth.js'
import { APP_VERSION } from '../shared/lib/version.js'

// Новая оболочка (ui v2, миграция по PROJECT.md): нижний бар Уроки/Профиль
// (+Админ для is_admin). Пока: лента — заглушка (шаг 3 миграции),
// профиль и админ — существующие вкладки внутри новой оболочки.
export default function ShellV2() {
  const [tab, setTab] = useState('feed')
  // Canvas-редактор урока (админ, «✎» на схеме модуля) — оверлеем поверх
  // оболочки: лента под ним не размонтируется и не теряет позицию
  const [canvasLesson, setCanvasLesson] = useState(null)
  const { isAdmin } = useAdmin()
  const { user } = useAuth()

  // На всякий случай: убираем возможный след старого фикса высоты
  // (iOS 26 рисует только 812px окна — растягивать DOM бесполезно,
  // низ просто обрезался; см. дебаг 3.2.726)
  useEffect(() => {
    document.documentElement.style.removeProperty('--v2-app-h')
  }, [])

  return (
    <div className="shellV2">
      <div className="shellV2Version">v{APP_VERSION} · ui2</div>
      <EnergyBadge hidden={tab === 'profile'} />

      {/* Все вкладки смонтированы всегда: переключение — только видимость.
          Нет перезагрузок и моргания, лента греет видео с самого старта,
          скролл и данные не теряются */}
      <div className="shellV2Content">
        <div className={tab === 'feed' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
          <FeedTab
            visible={tab === 'feed'}
            onOpenCanvas={setCanvasLesson}
            onRequireAuth={() => setTab('profile')}
          />
        </div>
        <div className={tab === 'profile' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
          {user
            ? <ProfileV2 visible={tab === 'profile'} userEmail={user.email} onOpenCanvas={setCanvasLesson} />
            : <div className="shellV2Panel"><AuthTab onLoginSuccess={() => {}} /></div>}
        </div>
        {isAdmin && (
          <div className={tab === 'admin' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
            <AdminV2 onOpenCanvas={setCanvasLesson} />
          </div>
        )}
      </div>

      <nav className="shellV2Nav">
        <button
          className={tab === 'feed' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
          onClick={() => setTab('feed')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="4" /><path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" /></svg>
          Уроки
        </button>
        <button
          className={tab === 'profile' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
          onClick={() => setTab('profile')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></svg>
          Профиль
        </button>
        {isAdmin && (
          <button
            className={tab === 'admin' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
            onClick={() => setTab('admin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></svg>
            Админ
          </button>
        )}
      </nav>

      {canvasLesson && (
        <div className="shellV2CanvasOverlay">
          <CanvasPage
            lessonId={canvasLesson.id}
            moduleLessons={canvasLesson.moduleLessons ?? []}
            onBack={() => setCanvasLesson(null)}
          />
        </div>
      )}
    </div>
  )
}
