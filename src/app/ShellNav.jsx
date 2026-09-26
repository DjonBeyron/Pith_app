import { Cog, Video, UserRound, Trophy, Brain } from 'lucide-react'
import { requestLessonsHome } from '../shared/lib/lessonsHomeEvent.js'

// Нижняя панель оболочки: Уроки / Память / Профиль / Рейтинг (+ Админ).
// Точка на «Памяти» — есть что повторить сегодня или новое слово из урока
// (без числа: число давило бы долгом, см. PROJECT.md → «Вкладки»). Вынесено из ShellV2.jsx
export default function ShellNav({ tab, setTab, learnDot, isRealAdmin, userMode }) {
  const cls = (id, extra = '') => `shellV2NavBtn${tab === id ? ' shellV2NavBtnActive' : ''}${extra}`
  return (
    <nav className="shellV2Nav">
      <button
        className={cls('feed')}
        // Уже на «Уроках» — повторное нажатие = «назад» из схемы модуля
        onClick={() => { if (tab === 'feed') requestLessonsHome(); setTab('feed') }}>
        <Video />
        Уроки
      </button>
      {/* data-nav — цель полёта нового слова из итога урока (memoryFresh.js) */}
      <button className={cls('learn', learnDot ? ' shellV2NavBtnDot' : '')} data-nav="learn" onClick={() => setTab('learn')}>
        <Brain />
        Память
      </button>
      <button className={cls('profile')} onClick={() => setTab('profile')}>
        <UserRound />
        Профиль
      </button>
      <button className={cls('rating')} onClick={() => setTab('rating')}>
        <Trophy />
        Рейтинг
      </button>
      {isRealAdmin && (
        /* В «режиме пользователя» это единственная админская кнопка на экране —
           помечаем точкой, иначе легко забыть, что режим ещё включён */
        <button className={cls('admin', userMode ? ' shellV2NavBtnUserMode' : '')} onClick={() => setTab('admin')}>
          <Cog />
          Админ
        </button>
      )}
    </nav>
  )
}
