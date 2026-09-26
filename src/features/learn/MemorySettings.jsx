import { useState } from 'react'
import { plural } from '../../shared/lib/plural.js'
import LearnVacation from './LearnVacation.jsx'
import MinutesSheet from './MinutesSheet.jsx'

// Раздел «Повторение» в настройках (шестерёнка профиля — одна на всё
// приложение, PROJECT.md → «Вкладки»): итоги недели, минуты в день и
// «Отпуск». Во вкладке «Память» настроек нет — там только главное действие
// и лестница. view — learnView (useLearnData в ShellV2), null — не загружен.
// «Отпуск» — только в аккаунте; вернуться — в шапке вкладки «Память»
const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' })

// Итоги недели — только в плюс: сравнение с прошлой неделей показываем,
// когда окрепло больше (меньше — не упрекаем)
function weekLine({ days, words, grew, prevGrew }) {
  if (!days) return 'На этой неделе повторений ещё не было'
  return `За 7 дней: ${days} ${plural(days, 'день', 'дня', 'дней')} с повторением · ${words} ${plural(words, 'слово', 'слова', 'слов')}`
    + (grew ? ` · окрепло ${grew}` : '')
    + (grew && prevGrew != null && grew > prevGrew ? ' — больше, чем неделей раньше' : '')
}

export default function MemorySettings({ view, isGuest, onChanged }) {
  const [minutesOpen, setMinutesOpen] = useState(false)
  if (!view) return null
  return (
    <section className="settingsSection">
      <h2 className="settingsSectionTitle">Повторение</h2>
      {!view.empty && <p className="settingsMemoryWeek">{weekLine(view.week)}</p>}
      <button className="settingsInstallBtn" onClick={() => setMinutesOpen(true)}>
        {view.minutes} минут в день · изменить
      </button>
      {!isGuest && !view.empty && (view.vacation
        ? <p className="settingsSectionNote">Ты в отпуске с {fmtDate(view.vacation.since)} — вернуться можно во вкладке «Память»</p>
        : <LearnVacation onChanged={onChanged} />)}
      {minutesOpen && (
        <MinutesSheet current={view.minutes} isGuest={isGuest}
          onClose={changed => { setMinutesOpen(false); if (changed) onChanged() }} />
      )}
    </section>
  )
}
