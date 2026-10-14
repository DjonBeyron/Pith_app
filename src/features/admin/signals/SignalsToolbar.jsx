import { useState } from 'react'
import { X, Sun, Moon } from 'lucide-react'
import { ENGINE_LABEL } from './signalTexts.js'

// Верхняя панель окна «Сигналы ленты»: движок legacy ⇄ weighted (аварийный выключатель),
// индикатор несохранённого, заметка и «Сохранить как новую версию», сброс черновика,
// дефолты, предупреждения валидатора и строка статуса. Логика — в useSignalsDraft.js.
export default function SignalsToolbar({ model, onEngine, onClose, closeRef, theme, onToggleTheme }) {
  const [note, setNote] = useState('')
  const { draft, dirty, warnings, status, busy, actions } = model
  const legacy = draft.engine === 'legacy'

  const save = () => { model.save(note.trim()); setNote('') }

  return (
    <header className="fsBar">
      <div className="fsBarRow">
        <h1 className="fsTitle">Сигналы ленты</h1>
        {/* Иконки в DOM сразу после заголовка: на телефоне они в его строке, на ПК уезжают в конец (CSS order) */}
        <button className="fsIconBtn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Светлая тема окна' : 'Тёмная тема окна'} title="Тема окна">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button ref={closeRef} className="fsIconBtn fsClose" onClick={onClose} aria-label="Закрыть окно (Esc)" title="Закрыть (Esc)">
          <X size={18} />
        </button>
        <div className="fsEngine" role="radiogroup" aria-label="Движок порядка ленты">
          <button role="radio" aria-checked={legacy} className={legacy ? 'fsEngineBtn fsEngineBtnOn' : 'fsEngineBtn'} onClick={() => onEngine('legacy')} disabled={busy}>
            Старый режим
          </button>
          <button role="radio" aria-checked={!legacy} className={!legacy ? 'fsEngineBtn fsEngineBtnOn fsEngineBtnW' : 'fsEngineBtn'} onClick={() => onEngine('weighted')} disabled={busy}>
            Взвешенный
          </button>
        </div>
        <span className="fsEngineHint">{legacy ? 'Лента в старом режиме — как до изменений, веса не влияют' : ENGINE_LABEL.weighted}</span>
        <span className={dirty ? 'fsDirty fsDirtyOn' : 'fsDirty'} aria-live="polite">{dirty ? 'Есть несохранённые изменения' : 'Черновик совпадает с активной версией'}</span>
      </div>
      <div className="fsBarRow fsBarActions">
        <input
          className="fsNote" value={note} onChange={e => setNote(e.target.value.slice(0, 200))}
          placeholder="Заметка к версии (что и зачем поменял)" aria-label="Заметка к версии"
          onKeyDown={e => { if (e.key === 'Enter' && dirty && !busy) save() }}
        />
        <button className="fsBtn fsBtnPrimary" onClick={save} disabled={!dirty || busy}>{busy ? 'Сохраняю…' : 'Сохранить как новую версию'}</button>
        <button className="fsBtn" onClick={actions.reset} disabled={!dirty || busy}>Сбросить черновик</button>
        <button className="fsBtn" onClick={actions.defaults} disabled={busy}>Вернуть дефолты</button>
      </div>
      {(warnings.length > 0 || status) && (
        <div className="fsMessages" aria-live="polite">
          {warnings.map(w => <p key={w.code + (w.id ?? '')} className="fsMsg fsMsgWarn">⚠ {w.text}</p>)}
          {status && <p className={`fsMsg fsMsg-${status.kind}`}>{status.text}</p>}
        </div>
      )}
    </header>
  )
}
