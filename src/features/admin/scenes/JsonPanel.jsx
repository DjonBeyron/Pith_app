import { useState } from 'react'
import { copyText, downloadText } from './fileUtils.js'
import ScTip from './ScTip.jsx'

// Вкладка «JSON»: текст сцены v2 — экспорт (копировать, скачать), правка и «Применить»
// (parseSceneV2 → ошибки по-русски с путями). Текст обновляется из черновика кнопкой
// «Обновить из сборщика», чтобы не затирать то, что админ печатает.
export default function JsonPanel({ draft, setStatus }) {
  const [text, setText] = useState(() => draft.exportJson())
  const [errors, setErrors] = useState([])
  const [note, setNote] = useState('')

  const refresh = () => { setText(draft.exportJson()); setErrors([]); setNote('Текст обновлён из сборщика') }
  const apply = () => {
    const r = draft.applyJson(text)
    setErrors(r.errors)
    if (r.ok) { setNote('Применено — сцена в сборщике обновлена'); setStatus({ kind: 'ok', text: 'JSON применён к сцене' }) } else setNote('')
  }
  const copy = async () => setNote((await copyText(text)) ? 'Скопировано' : 'Не удалось скопировать — выделите текст вручную')
  const download = () => downloadText(`${draft.scene.id || 'scene'}.json`, text, 'application/json;charset=utf-8')

  return (
    <div className="scbJson">
      <p className="scbSub">Полный JSON сцены <ScTip help="json" /> — его читает лента и хранит библиотека. Правьте и нажмите «Применить».</p>
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnSmall" onClick={refresh}>Обновить из сборщика</button>
        <button type="button" className="fsBtn fsBtnSmall" onClick={copy}>Скопировать</button>
        <button type="button" className="fsBtn fsBtnSmall" onClick={download}>Скачать .json</button>
      </div>
      <textarea className="fsNote scbCode" value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-label="JSON сцены" rows={18} />
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnPrimary" onClick={apply}>Применить</button>
        {note && <span className="scbNote" role="status">{note}</span>}
      </div>
      {errors.length > 0 && (
        <ul className="scbErrors" role="alert">
          {errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  )
}
