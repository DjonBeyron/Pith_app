import { useState } from 'react'
import { STATUS_LABEL, durLabel, voiceable } from './raceVoiceTable.js'

// Одна строка таблицы «Озвучка Пита» (RaceVoiceTable.jsx) — на телефоне карточка: сверху id мелко, статус и длительность; ниже текст полем на всю ширину и кнопки справа
// («Сохранить» — только когда текст правили, «Переозвучить» / «Озвучить»). Черновик живёт в строке; после сохранения таблица перемонтирует строку с новым текстом.
export default function RaceVoiceRow({ row, locked, error, onSave, onVoice }) {
  const [draft, setDraft] = useState(row.text ?? '')
  const dirty = row.editable && draft.trim() !== String(row.text ?? '').trim()
  const can = voiceable(row) && !dirty
  return (
    <li className="rvRow" data-status={row.status} data-testid={`rv-row-${row.id}`}>
      <div className="rvHead">
        <code className="rvId" title={row.when}>{row.id}</code>
        <span className={`rvStatus rvStatus-${row.status}`} data-testid="rv-status">{STATUS_LABEL[row.status]}</span>
        {durLabel(row.duration) && <span className="rvDur">{durLabel(row.duration)}</span>}
      </div>
      {row.label && <div className="rvLabel">{row.label}</div>}
      <div className="rvEdit">
        <input className="aspInput rvText" type="text" value={draft} readOnly={!row.editable} disabled={locked} aria-label={`Текст ${row.id}`}
          placeholder={row.group === 'meaning' ? 'Смысл по-русски (намерение, не перевод)' : row.group === 'scene' ? 'Ситуация: ты знакомишься с новым человеком' : ''} onChange={e => setDraft(e.target.value)} data-testid="rv-text" />
        {dirty && <button type="button" className="aspChip" disabled={locked || !draft.trim()} onClick={() => onSave(row, draft)} data-testid="rv-save">Сохранить</button>}
        <button type="button" className="aspChip" disabled={locked || !can} onClick={() => onVoice(row)} data-testid="rv-voice">{row.status === 'none' ? 'Озвучить' : 'Переозвучить'}</button>
      </div>
      {error && <p className="aspErr" role="alert" data-testid="rv-error">{error}</p>}
    </li>
  )
}
