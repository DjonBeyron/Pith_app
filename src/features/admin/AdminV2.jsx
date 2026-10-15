import { useState, useEffect, lazy, Suspense } from 'react'
import { lazyRetry } from '../../shared/lib/lazyRetry.js'
import { useSceneBuilderRequest } from '../../shared/lib/useSceneBuilderRequest.js'
import AdminModulesTab from './AdminModulesTab.jsx'
import AdminTab from './AdminTab.jsx'
import AdminNotificationsTab from './AdminNotificationsTab.jsx'
import AdminRaceTab from './AdminRaceTab.jsx'
import AdminStreakTab from './AdminStreakTab.jsx'
import AdminErrorsTab from './AdminErrorsTab.jsx'
import AdminAnalyticsTab from './AdminAnalyticsTab.jsx'
import AdminTeacherTab from './AdminTeacherTab.jsx'
import AdminDecksTab from './AdminDecksTab.jsx'
import AdminReviewTab from './AdminReviewTab.jsx'
import AdminCatchTab from './AdminCatchTab.jsx'
import AdminAchievementsTab from './AdminAchievementsTab.jsx'
import AdminSpeechTab from './speech/AdminSpeechTab.jsx'
import AdminStartTab from './start/AdminStartTab.jsx'
import AdminSignalsTab from './signals/AdminSignalsTab.jsx'
import AdminToggles from './AdminToggles.jsx'
import VersionStamp from './VersionStamp.jsx'

// «Сцены» (конструктор сцен, этап 2: галерея спрайтов, сборщик, спецификация дизайнеру) — ленивый chunk:
// тянет рендерер сцен и реестр спрайтов, обычному пользователю не нужен
const ScenesTab = lazy(() => lazyRetry(() => import('./scenes/ScenesTab.jsx'), 'admin-scenes'))

// Админ-раздел новой оболочки: субвкладки «Модули» (список с публикацией),
// «Файлы» (таблица файлов R2), «Пуши» (рассылка), «Гонка» (супергонка),
// «Стрик» (вехи наград), «Учитель» (общий учитель всех уроков), «Ошибки»
// (ошибки клиентов из client_errors), «Аналитика» (отчёт по app_events) и
// «Колоды» (слова без колоды карточек повтора, AdminDecksTab), «Повторение»
// (временный вход в плеер повторения + своя память слов, AdminReviewTab), «Ловля» (песочница «Ловли слов», AdminCatchTab) и «Достижения» (выдать/снять себе достижение,
// AdminAchievementsTab) и «Голос» (проба Web Speech API на телефонах, speech/AdminSpeechTab) и «Старт» (журнал запуска приложения на этом устройстве, start/AdminStartTab)
// и «Сигналы» (движок порядка ленты: карточка состояния + полноэкранное окно, signals/AdminSignalsTab; learnView — память админа из ShellV2 для предпросмотра)
// и «Сцены» (конструктор сцен «два кота говорят»: спрайты, сборщик, для дизайнера — scenes/ScenesTab). Открытая субвкладка запоминается
// на устройстве; тумблеры («Режим пользователя», «Я новенький» — имитация первого входа, newbieSim.js, и др.) — в одном
// сворачиваемом блоке «Переключатели» (AdminToggles).
// openModule — { id, title, isPro }: просьба снаружи открыть схему этого
// модуля (возврат «назад» из редактора урока, см. ShellV2). Сбрасывается
// через onModuleOpened, чтобы повторный заход в админку не открывал её снова
// Какая субвкладка открыта — запоминается на этом устройстве: админка открывается там же, где её оставили
const SUB_KEY = 'pithy_admin_sub_v1'
const SUBS = ['modules', 'files', 'push', 'race', 'streak', 'teacher', 'errors', 'analytics', 'decks', 'review', 'catch', 'achievements', 'speech', 'start', 'signals', 'scenes']
function storedSub() {
  try { const v = localStorage.getItem(SUB_KEY); return SUBS.includes(v) ? v : 'modules' } catch { return 'modules' }
}

export default function AdminV2({ onOpenCanvas, onOpenProduction, onOpenCards, openModule = null, onModuleOpened, learnView = null }) {
  const [sub, setSubState] = useState(storedSub) // modules | files | push | race | streak | teacher | errors | analytics | decks | review | catch | achievements | speech | start | signals | scenes
  const setSub = id => {
    setSubState(id)
    try { localStorage.setItem(SUB_KEY, id) } catch { /* приватный режим — запомнится до перезагрузки */ }
  }

  useEffect(() => {
    // Просьба извне открыть схему модуля — переводим админку на «Модули»
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openModule?.id) setSub('modules')
  }, [openModule])

  // «← Вернуться в сборщик» с тестового слайда ленты: субвкладка «Сцены» (окно сборщика откроет ScenesTab)
  const sceneBuilderRequest = useSceneBuilderRequest()
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sceneBuilderRequest) setSub('scenes')
  }, [sceneBuilderRequest])

  return (
    <div className="avWrap">
      {/* Над субвкладками, а не внутри одной из них: в «режиме пользователя»
          «Режим пользователя» — единственная дверь обратно, искать её по
          вкладкам не нужно. Все тумблеры — в одном сворачиваемом блоке */}
      <AdminToggles />
      <div className="avTabs">
        <button className={sub === 'modules' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('modules')}>
          Модули
        </button>
        <button className={sub === 'files' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('files')}>
          Файлы
        </button>
        <button className={sub === 'push' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('push')}>
          Пуши
        </button>
        <button className={sub === 'race' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('race')}>
          Гонка
        </button>
        <button className={sub === 'streak' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('streak')}>
          Стрик
        </button>
        <button className={sub === 'teacher' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('teacher')}>
          Учитель
        </button>
        <button className={sub === 'errors' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('errors')}>
          Ошибки
        </button>
        <button className={sub === 'analytics' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('analytics')}>
          Аналитика
        </button>
        <button className={sub === 'decks' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('decks')}>
          Колоды
        </button>
        <button className={sub === 'review' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('review')}>
          Повторение
        </button>
        <button className={sub === 'catch' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('catch')}>
          Ловля
        </button>
        <button className={sub === 'achievements' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('achievements')}>
          Достижения
        </button>
        <button className={sub === 'speech' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('speech')}>
          Голос
        </button>
        <button className={sub === 'start' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('start')}>
          Старт
        </button>
        <button className={sub === 'signals' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('signals')}>
          Сигналы
        </button>
        <button className={sub === 'scenes' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('scenes')}>
          Сцены
        </button>
      </div>
      <VersionStamp />
      {sub === 'modules' && (
        <AdminModulesTab
          onOpenCanvas={onOpenCanvas}
          onOpenProduction={onOpenProduction}
          moduleToOpen={openModule}
          onModuleOpened={onModuleOpened}
        />
      )}
      {sub === 'files' && <div className="shellV2Panel"><AdminTab /></div>}
      {sub === 'push' && <div className="shellV2Panel"><AdminNotificationsTab /></div>}
      {sub === 'race' && <div className="shellV2Panel"><AdminRaceTab /></div>}
      {sub === 'streak' && <AdminStreakTab />}
      {sub === 'teacher' && <div className="shellV2Panel"><AdminTeacherTab /></div>}
      {sub === 'errors' && <div className="shellV2Panel"><AdminErrorsTab /></div>}
      {sub === 'analytics' && <div className="shellV2Panel"><AdminAnalyticsTab /></div>}
      {sub === 'decks' && <div className="shellV2Panel"><AdminDecksTab onOpenCards={onOpenCards} /></div>}
      {sub === 'review' && <div className="shellV2Panel"><AdminReviewTab /></div>}
      {sub === 'catch' && <div className="shellV2Panel"><AdminCatchTab /></div>}
      {sub === 'achievements' && <div className="shellV2Panel"><AdminAchievementsTab /></div>}
      {sub === 'speech' && <div className="shellV2Panel"><AdminSpeechTab /></div>}
      {sub === 'start' && <div className="shellV2Panel"><AdminStartTab /></div>}
      {sub === 'signals' && <div className="shellV2Panel"><AdminSignalsTab learnView={learnView} /></div>}
      {sub === 'scenes' && (
        <div className="shellV2Panel">
          <Suspense fallback={<p className="aeHint" style={{ padding: 16 }}>Загрузка конструктора сцен…</p>}>
            <ScenesTab />
          </Suspense>
        </div>
      )}
    </div>
  )
}
