import InfoPopup from '../../shared/ui/InfoPopup.jsx'
import { TIME_LIMIT_MIN, TIME_LIMIT_MAX } from '../../shared/lib/timeLimit.js'

// Лимит времени на ответ (поле timeLimitSec) для «Выбери слово» и «Собери фразу». Пусто — без таймера. Не успел за отведённое
// время — ответ идёт по выходу «неверно» без штрафа (панель сама закрывается), у ученика в настройках урока таймер можно выключить.
export default function NodeTimeLimit({ value, onChange }) {
  return (
    <div className="nodeSayCheckRow" onClick={e => e.stopPropagation()}>
      <span className="nodeTwLabel">Лимит времени, сек</span>
      <input
        type="number" className="nodeWcInput" style={{ width: 72 }}
        min={TIME_LIMIT_MIN} max={TIME_LIMIT_MAX} step={1}
        value={value ?? ''} placeholder="нет"
        aria-label="Лимит времени на ответ, секунд"
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        onClick={e => e.stopPropagation()}
      />
      <InfoPopup title="Лимит времени" testId="time-limit-info">
        <p>Ученик должен ответить за отведённое число секунд ({TIME_LIMIT_MIN}–{TIME_LIMIT_MAX}). Не успел — ответ идёт по выходу «неверно», штрафа нет.</p>
        <p>Пусто — без таймера. Ученик может выключить таймеры в настройках урока. Для быстрых вопросов хватает 5–8 секунд.</p>
      </InfoPopup>
    </div>
  )
}
