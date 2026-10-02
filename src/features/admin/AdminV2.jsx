import { useState, useEffect } from 'react'
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
import AdminAchievementsTab from './AdminAchievementsTab.jsx'
import AdminUserModeToggle from './AdminUserModeToggle.jsx'
import AdminNewbieToggle from './AdminNewbieToggle.jsx'
import AdminDebugUiToggle from './AdminDebugUiToggle.jsx'
import AdminAudioWaveformToggle from './AdminAudioWaveformToggle.jsx'
import AdminWordChoiceVoiceToggle from './AdminWordChoiceVoiceToggle.jsx'
import { APP_VERSION } from '../../shared/lib/version.js'

// Админ-раздел новой оболочки: субвкладки «Модули» (список с публикацией),
// «Файлы» (таблица файлов R2), «Пуши» (рассылка), «Гонка» (супергонка),
// «Стрик» (вехи наград), «Учитель» (общий учитель всех уроков), «Ошибки»
// (ошибки клиентов из client_errors), «Аналитика» (отчёт по app_events) и
// «Колоды» (слова без колоды карточек повтора, AdminDecksTab), «Повторение»
// (временный вход в плеер повторения + своя память слов, AdminReviewTab) и «Достижения» (выдать/снять себе достижение,
// AdminAchievementsTab). Открытая субвкладка запоминается
// на устройстве; рядом с «Режимом пользователя» — «Я новенький» (имитация первого входа, newbieSim.js).
// openModule — { id, title, isPro }: просьба снаружи открыть схему этого
// модуля (возврат «назад» из редактора урока, см. ShellV2). Сбрасывается
// через onModuleOpened, чтобы повторный заход в админку не открывал её снова
// Какая субвкладка открыта — запоминается на этом устройстве: админка открывается там же, где её оставили
const SUB_KEY = 'pithy_admin_sub_v1'
const SUBS = ['modules', 'files', 'push', 'race', 'streak', 'teacher', 'errors', 'analytics', 'decks', 'review', 'achievements']
function storedSub() {
  try { const v = localStorage.getItem(SUB_KEY); return SUBS.includes(v) ? v : 'modules' } catch { return 'modules' }
}

export default function AdminV2({ onOpenCanvas, onOpenProduction, onOpenCards, openModule = null, onModuleOpened }) {
  const [sub, setSubState] = useState(storedSub) // modules | files | push | race | streak | teacher | errors | analytics | decks | review | achievements
  const setSub = id => {
    setSubState(id)
    try { localStorage.setItem(SUB_KEY, id) } catch { /* приватный режим — запомнится до перезагрузки */ }
  }

  useEffect(() => {
    // Просьба извне открыть схему модуля — переводим админку на «Модули»
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openModule?.id) setSub('modules')
  }, [openModule])

  return (
    <div className="avWrap">
      {/* Над субвкладками, а не внутри одной из них: в «режиме пользователя»
          «Режим пользователя» — единственная дверь обратно, искать её по
          вкладкам не нужно */}
      <div className="avToggles">
        <AdminUserModeToggle />
        <AdminNewbieToggle />
        <AdminDebugUiToggle />
        <AdminAudioWaveformToggle />
        <AdminWordChoiceVoiceToggle />
      </div>
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
        <button className={sub === 'achievements' ? 'avTab avTabActive' : 'avTab'} onClick={() => setSub('achievements')}>
          Достижения
        </button>
      </div>
      <div className="avVersion">v{APP_VERSION}</div>
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
      {sub === 'achievements' && <div className="shellV2Panel"><AdminAchievementsTab /></div>}
    </div>
  )
}
