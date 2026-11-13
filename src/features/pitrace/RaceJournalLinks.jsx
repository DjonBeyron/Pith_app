import { useState } from 'react'
import { saveJournalNow, copyJournalNow, sendJournalNow } from '../player/modules/rotate-phone/wordLaneJournalNow.js'

// Неброская строка «⬇ Скачать журнал игры · Скопировать» под кнопками итога «Встряхни память» (RaceSummary.jsx; стили — race-final.css). Только для отладочного интерфейса (админ / player_debug_ui / шестерёнка):
// шестерёнка HUD на итоге закрыта самим экраном итога (z-index 30), поэтому журнал всего сеанса доступен прямо здесь. Журнал формирует и отдаёт wordLaneJournalNow.js — тот же путь, что в шестерёнке:
// iPhone — лист «Поделиться» (нет — новая вкладка), остальное — скачивание; «Скопировать» — запасной путь (текст в буфер, вставить в чат). Функции зовутся синхронно в обработчике нажатия — жест пользователя
// не теряется (на iOS без него «Поделиться» и буфер обмена отказывают). Клик не всплывает к экрану итога и не трогает «Ещё раз» / «Готово».
export default function RaceJournalLinks() {
  const [status, setStatus] = useState('')
  const run = (fn, wait) => e => {
    e.stopPropagation()
    if (wait) setStatus(wait)
    fn().then(setStatus, () => setStatus(''))
  }
  return (
    <div className="raceJournal" data-testid="race-journal">
      <div className="raceJournalRow">
        <button type="button" className="raceJournalLink" onClick={run(saveJournalNow, 'Готовлю журнал…')} data-no-unlock="" data-testid="race-journal-save">⬇ Скачать журнал игры</button>
        <span className="raceJournalDot" aria-hidden="true">·</span>
        <button type="button" className="raceJournalLink" onClick={run(copyJournalNow)} data-no-unlock="" data-testid="race-journal-copy">Скопировать</button>
        <span className="raceJournalDot" aria-hidden="true">·</span>
        <button type="button" className="raceJournalLink" onClick={run(sendJournalNow, 'Отправляю логи…')} data-no-unlock="" data-testid="race-journal-send">В GitHub</button>
      </div>
      {status && <div className="raceJournalStatus" role="status" data-testid="race-journal-status">{status}</div>}
    </div>
  )
}
