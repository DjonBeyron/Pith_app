import { useState } from 'react'
import { exportJson, importJson } from './draftModel.js'
import HelpTip from './HelpTip.jsx'

const FIELDS = [
  { help: 'json_version', name: 'version' },
  { help: 'json_engine', name: 'engine' },
  { help: 'json_signals', name: 'signals' },
  { help: 'json_rules', name: 'rules' },
  { help: 'json_note', name: 'note' },
]

// Вкладка «JSON» средней колонки: экспорт черновика и импорт с валидацией — чтобы
// конфиг мог править человек или нейросеть (как в стенде сцен). «Применить к
// черновику» ничего не сохраняет на сервер — дальше обычное «Сохранить».
export default function ConfigJsonPanel({ draft, onApply }) {
  const [text, setText] = useState(() => exportJson(draft))
  const [errors, setErrors] = useState([])
  const [note, setNote] = useState('')

  const refresh = () => { setText(exportJson(draft)); setErrors([]); setNote('Текст обновлён из черновика') }
  const apply = () => {
    const r = importJson(text)
    setErrors(r.errors)
    if (r.ok) { onApply(r.config); setNote('Применено к черновику — проверь предпросмотр и сохрани') } else setNote('')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setNote('Скопировано') } catch { setNote('Не удалось скопировать — выдели текст вручную') }
  }

  return (
    <div className="cjWrap">
      <p className="cjHint">
        Формат: <code>{'{ version:1, engine, signals:{ id:{ enabled, weight 0..100 } }, rules:{ exploreEvery, maxSameTypeInRow }, note }'}</code>.
        Можно передавать часть сигналов — остальные останутся по умолчанию. Не-live сигналы включить нельзя.
        <HelpTip help="json_format" />
      </p>
      <ul className="cjFields" aria-label="Поля конфига">
        {FIELDS.map(f => <li key={f.name}><code>{f.name}</code><HelpTip help={f.help} /></li>)}
      </ul>
      <textarea
        className="cjText" value={text} onChange={e => { setText(e.target.value); setNote('') }} spellCheck={false}
        aria-label="JSON конфига" rows={16}
      />
      <div className="cjBtns">
        <button className="fsBtn fsBtnPrimary" onClick={apply}>Применить к черновику</button>
        <button className="fsBtn" onClick={refresh}>Обновить из черновика</button>
        <button className="fsBtn" onClick={copy}>Копировать</button>
      </div>
      {errors.length > 0 && (
        <ul className="cjErrors" role="alert">
          {errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      {note && <p className="cjNote" aria-live="polite">{note}</p>}
    </div>
  )
}
