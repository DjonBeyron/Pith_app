import PolishCardLines from './PolishCardLines.jsx'
import { FULL_ID } from '../../rehearsal/polish/polishActs.js'

// Карточка этапа в «Шлифовке репетиции». Свёрнута (по умолчанию): одна строка — стрелка, «номер. название» слева, «Запустить» справа, больше ничего. Тап по названию разворачивает: подсказка, реплики Пита с «Послушать»,
// число комментариев, «Экспорт комментариев», «Очистить» (второй тап подтверждает), заметка о результате. Нет этапа в плане (ok: false) — «Запустить» недоступна, название приглушено, в развороте объяснение.
// У «Полной игры» (FULL_ID) своих комментариев нет — они лежат на карточках этапов, поэтому ни счётчика, ни экспорта, а реплики — только сводка «озвучено N/M».
export default function PolishActCard({ act, num, open, ok, idle, onToggle, onRun, lines, comments = 0, armed = false, note = '', onExport, onClear }) {
  const full = act.id === FULL_ID
  return (
    <li className="rhpCard" data-open={open ? '1' : undefined} data-testid={`rh-polish-${act.id}`}>
      <div className="rhpBar">
        <button type="button" className="rhpToggle" aria-expanded={open} onClick={onToggle} data-off={ok ? undefined : '1'} data-testid={`rh-polish-toggle-${act.id}`}>
          <span className="rhpArrow" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <strong className="rhpName">{`${num}. ${act.title}`}</strong>
        </button>
        <button type="button" className="aspSay" onClick={onRun} disabled={!ok || !idle} data-testid={`rh-polish-run-${act.id}`}>Запустить</button>
      </div>
      {open && (
        <div className="rhpBody" data-testid={`rh-polish-body-${act.id}`}>
          <p className="rhpHint">{ok ? act.hint : 'В этом плане такого этапа нет — выбери другую фикстуру.'}</p>
          <PolishCardLines act={act.id} lines={lines} compact={full} />
          {!full && (
            <div className="aspRow rhpTools">
              <span className="rhpCount" data-testid={`rh-polish-count-${act.id}`}>комментариев: {comments}</span>
              <button type="button" className="aspChip" onClick={onExport} disabled={!comments} data-testid={`rh-polish-export-${act.id}`}>Экспорт комментариев</button>
              <button type="button" className="aspChip" onClick={onClear} disabled={!comments && !armed} data-testid={`rh-polish-clear-${act.id}`}>{armed ? 'Стереть точно?' : 'Очистить'}</button>
            </div>
          )}
          {note && <div className="rhpHint" role="status" data-testid={`rh-polish-note-${act.id}`}>{note}</div>}
        </div>
      )}
    </li>
  )
}
