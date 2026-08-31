import { useState, useEffect, lazy, Suspense } from 'react'
import FeedTab from '../features/feed/FeedTab.jsx'
import ProfileV2 from '../features/profile/ProfileV2.jsx'
import AuthTab from '../features/auth/AuthTab.jsx'
import SettingsTab from '../features/settings/SettingsTab.jsx'
import { Cog, Video, UserRound, Trophy } from 'lucide-react'
import BackButton from '../shared/ui/BackButton.jsx'
import RatingTab from '../features/rating/RatingTab.jsx'
import RaceGlobalPopups from '../features/race/RaceGlobalPopups.jsx'
import OrientationGuard from '../shared/ui/OrientationGuard.jsx'
import UpdateToast from './UpdateToast.jsx'
import { lazyRetry } from '../shared/lib/lazyRetry.js'
import InstallPrompt from '../shared/ui/InstallPrompt.jsx'
import EnergyBadge from './EnergyBadge.jsx'
import TicketBadge from './TicketBadge.jsx'
import LevelBadge from './LevelBadge.jsx'
import { useAdmin } from './AdminContext.jsx'
import { useAuth } from '../shared/lib/useAuth.js'
import { useStreakGate } from '../features/streak/useStreakGate.js'
import StreakGateOverlay from '../features/streak/StreakGateOverlay.jsx'
import { canvasLsKey } from '../features/canvas/canvasStorageKeys.js'
import ResumeEditingToast from '../shared/ui/ResumeEditingToast.jsx'

// Код-сплиттинг: админка и canvas-редактор нужны только is_admin — обычный
// пользователь эти chunk'и даже не скачивает (см. PROJECT.md, этап 2)
const AdminV2         = lazy(() => lazyRetry(() => import('../features/admin/AdminV2.jsx'), 'admin'))
const CanvasPage      = lazy(() => lazyRetry(() => import('../features/canvas/CanvasPage.jsx'), 'canvas'))
const ProductionPage  = lazy(() => lazyRetry(() => import('../features/production/ProductionPage.jsx'), 'production'))

// Новая оболочка (ui v2, миграция по PROJECT.md): нижний бар Уроки/Профиль
// (+Админ для is_admin). Пока: лента — заглушка (шаг 3 миграции),
// профиль и админ — существующие вкладки внутри новой оболочки.
export default function ShellV2() {
  const [tab, setTab] = useState('feed')
  // Canvas-редактор урока (админ, «✎» на схеме модуля) — оверлеем поверх
  // оболочки: лента под ним не размонтируется и не теряет позицию
  const [canvasLesson, setCanvasLesson] = useState(null)
  // Продакшен-редактор (линейный список сообщений) — тот же оверлей-паттерн,
  // над теми же данными урока, что и canvas (см. PROJECT.md)
  const [productionLesson, setProductionLesson] = useState(null)
  // Модуль, который админ-вкладка должна открыть по возвращении из редактора
  // («назад» в канвасе ведёт в схему модуля урока, а не на главный экран)
  const [moduleRequest, setModuleRequest] = useState(null)
  // Всплывашка «продолжить редактирование» закрыта на этот сеанс: сама она
  // больше не прячется по таймеру
  const [resumeClosed, setResumeClosed] = useState(false)
  // Сигнал вкладке «Рейтинг» открыть страницу гонки (из попапа-анонса)
  const [raceOpenTick, setRaceOpenTick] = useState(0)
  // Настройки доступны и гостю (не только залогиненному, см. ProfileV2) —
  // например, инструкция «Как установить» нужна ДО регистрации
  const [guestSettings, setGuestSettings] = useState(false)
  const { isAdmin } = useAdmin()
  const { user } = useAuth()
  // Ежедневное полноэкранное окно серии: показывать или нет — решает сервер
  // (первый заход в сутки), см. useStreakGate.js
  const { gate, closeGate } = useStreakGate()
  // Лого стартового сплэша уже улетело (событие из index.html). Пока оно на
  // экране, ленту не паузим: сплэш снимается по первому кадру видео, и на
  // паузе он висел бы до страховки в 3.5 секунды
  const [splashGone, setSplashGone] = useState(() => !!window.__pithySplashGone)

  // На всякий случай: убираем возможный след старого фикса высоты
  // (iOS 26 рисует только 812px окна — растягивать DOM бесполезно,
  // низ просто обрезался; см. дебаг 3.2.726)
  useEffect(() => {
    document.documentElement.style.removeProperty('--v2-app-h')
  }, [])

  useEffect(() => {
    if (splashGone) return
    const onGone = () => setSplashGone(true)
    window.addEventListener('pithy:splash-gone', onGone)
    return () => window.removeEventListener('pithy:splash-gone', onGone)
  }, [splashGone])

  // Окно серии открыто и сплэш ушёл — лента под ним замолкает (у вернувшегося
  // пользователя звук может быть включён с прошлого раза)
  const feedPaused = !!gate && splashGone

  return (
    <div className="shellV2">
      <OrientationGuard />
      <InstallPrompt />
      <UpdateToast tab={tab} />
      {/* Верхняя панель игрока: слева уровень + золотые билеты (мельче, у
          самого верха), справа энергия. Версия приложения — в админке
          (AdminV2) и на стартовом сплэше (index.html), не в ленте */}
      {tab !== 'profile' && tab !== 'admin' && (
        <>
          <div className="hudBarLeft">
            <LevelBadge />
            <TicketBadge />
          </div>
          <div className={tab === 'feed' ? 'hudBarRight hudBarRightFeed' : 'hudBarRight'}>
            <EnergyBadge />
          </div>
        </>
      )}

      {/* Все вкладки смонтированы всегда: переключение — только видимость.
          Нет перезагрузок и моргания, лента греет видео с самого старта,
          скролл и данные не теряются */}
      <div className="shellV2Content">
        <div className={tab === 'feed' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
          <FeedTab
            visible={tab === 'feed' && !feedPaused}
            onOpenCanvas={setCanvasLesson}
            onRequireAuth={() => setTab('profile')}
          />
        </div>
        <div className={tab === 'rating' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
          <RatingTab visible={tab === 'rating'} openRaceTick={raceOpenTick} />
        </div>
        <div className={tab === 'profile' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
          {user ? (
            <ProfileV2 visible={tab === 'profile'} userEmail={user.email} onOpenCanvas={setCanvasLesson} />
          ) : guestSettings ? (
            <div className="pvSettingsScreen">
              <BackButton onClick={() => setGuestSettings(false)} label="Профиль" className="pvBack" />
              <div className="shellV2Panel"><SettingsTab /></div>
            </div>
          ) : (
            <div className="shellV2Panel">
              <div className="pvHead">
                <button className="pvGear" onClick={() => setGuestSettings(true)} title="Настройки">
                  <Cog />
                </button>
              </div>
              <AuthTab onLoginSuccess={() => {}} />
            </div>
          )}
        </div>
        {isAdmin && (
          <div className={tab === 'admin' ? 'shellV2Tab' : 'shellV2Tab shellV2TabHidden'}>
            <Suspense fallback={<div className="shellV2Panel">Загрузка…</div>}>
              <AdminV2
                onOpenCanvas={setCanvasLesson}
                onOpenProduction={setProductionLesson}
                openModule={moduleRequest}
                onModuleOpened={() => setModuleRequest(null)}
              />
            </Suspense>
          </div>
        )}
      </div>

      <nav className="shellV2Nav">
        <button
          className={tab === 'feed' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
          onClick={() => setTab('feed')}>
          <Video />
          Уроки
        </button>
        <button
          className={tab === 'profile' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
          onClick={() => setTab('profile')}>
          <UserRound />
          Профиль
        </button>
        <button
          className={tab === 'rating' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
          onClick={() => setTab('rating')}>
          <Trophy />
          Рейтинг
        </button>
        {isAdmin && (
          <button
            className={tab === 'admin' ? 'shellV2NavBtn shellV2NavBtnActive' : 'shellV2NavBtn'}
            onClick={() => setTab('admin')}>
            <Cog />
            Админ
          </button>
        )}
      </nav>

      {/* Админу при запуске: вернуться к уроку, который правил в прошлый раз */}
      {isAdmin && !resumeClosed && !canvasLesson && !productionLesson && (
        <ResumeEditingToast
          onOpen={lesson => {
            setResumeClosed(true)
            setCanvasLesson({ id: lesson.id, moduleLessons: [], module: lesson.module ?? null })
          }}
          onClose={() => setResumeClosed(true)}
        />
      )}

      {/* Окно серии — первое на старте: попапы гонки ждут, пока его закроют,
          иначе два полноэкранных окна легли бы друг на друга */}
      {gate && <StreakGateOverlay state={gate.state} res={gate.res} onClose={closeGate} />}

      {/* Попапы супергонки: анонс недели и итоги — поверх любой вкладки */}
      {!gate && <RaceGlobalPopups onOpenRace={() => { setTab('rating'); setRaceOpenTick(t => t + 1) }} />}

      {canvasLesson && (
        <div className="shellV2CanvasOverlay">
          <Suspense fallback={<div className="shellV2Panel">Загрузка редактора…</div>}>
            <CanvasPage
              lessonId={canvasLesson.id}
              moduleLessons={canvasLesson.moduleLessons ?? []}
              module={canvasLesson.module ?? null}
              /* Назад — в схему модуля этого урока (если знаем её), а не на
                 главный экран: чаще всего дальше правят соседний урок */
              onBack={found => {
                // Модуль мог быть найден уже внутри редактора (урок открыли
                // из всплывашки, где модуль неизвестен) — он и приходит сюда
                const m = found ?? canvasLesson.module
                setCanvasLesson(null)
                if (!m?.id || !isAdmin) return
                setModuleRequest(m)
                setTab('admin')
              }}
              onOpenProduction={id => {
                setCanvasLesson(null)
                setProductionLesson({ id, moduleLessons: canvasLesson.moduleLessons ?? [] })
              }}
            />
          </Suspense>
        </div>
      )}

      {productionLesson && (
        <div className="shellV2CanvasOverlay">
          <Suspense fallback={<div className="shellV2Panel">Загрузка продакшена…</div>}>
            <ProductionPage
              lessonId={productionLesson.id}
              moduleLessons={productionLesson.moduleLessons ?? []}
              onBack={() => setProductionLesson(null)}
              onOpenCanvas={id => {
                // Продакшен только что сохранил на сервер (см. ProductionPage.
                // switchToCanvas) — это самая свежая версия урока. Но у
                // CanvasBoard есть СВОЙ localStorage-черновик (canvasLsKey),
                // который при монтировании имеет приоритет над initialNodes —
                // если он остался от прошлой, незакрытой через «Сохранить»/
                // «Продакшен» сессии канваса, он перекрыл бы то, что только
                // что поменяли в списке, и порядок «не долетал» бы до графа
                localStorage.removeItem(canvasLsKey(id))
                setProductionLesson(null)
                setCanvasLesson({ id, moduleLessons: productionLesson.moduleLessons ?? [] })
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
