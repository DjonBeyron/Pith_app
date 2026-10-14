import { useState } from 'react'
import { X, Sun, Moon } from 'lucide-react'
import { formatBackupTime } from './draftBackup.js'

// Верхняя панель сборщика: название и id сцены, индикатор несохранённого, «Сохранить»
// (в библиотеку; при отсутствии таблицы — только локальный бэкап), «Новая», тема, закрыть
// (Esc), строка статуса и плашка «восстановлен черновик из резервной копии».
// onApply (управляемый режим, сцена для ноды урока) — «Применить к ноде» первой кнопкой;
// сохранение в библиотеку остаётся отдельной, необязательной кнопкой.
export default function BuilderToolbar({ draft, library, status, setStatus, title = 'Сборщик сцен', onSave, onApply = null, onClose, closeRef, theme, onToggleTheme }) {
  const { scene, saved, dirty, errors, restoredAt, actions } = draft
  const [askNew, setAskNew] = useState(false)
  const canSave = !library.busy && !library.missingTable
  const canApply = !!onApply && errors.length === 0
  // confirm() браузер может блокировать — подтверждение прямо в тулбаре
  const reset = () => {
    if (dirty && !askNew) { setAskNew(true); return }
    setAskNew(false)
    actions.reset()
    setStatus(null)
  }

  return (
    <header className="fsBar">
      <div className="fsBarRow">
        <h1 className="fsTitle">{title}</h1>
        <button className="fsIconBtn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Светлая тема окна' : 'Тёмная тема окна'} title="Тема окна">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button ref={closeRef} className="fsIconBtn fsClose" onClick={onClose} aria-label="Закрыть окно (Esc)" title="Закрыть (Esc)">
          <X size={18} />
        </button>
        <label className="scbField scbFieldTitle">
          <span className="scbFieldLabel">Название</span>
          <input id="f-title" className="fsNote" value={scene.title} maxLength={60} onChange={e => actions.setTitle(e.target.value)} placeholder="Например: Кофе-брейк" />
        </label>
        <label className="scbField scbFieldId">
          <span className="scbFieldLabel">id</span>
          <input id="f-id" className="fsNote scbMono" value={scene.id} maxLength={40} onChange={e => actions.setId(e.target.value)} spellCheck={false} />
        </label>
        <div className="fsDirtyBox">
          <span className={dirty ? 'fsDirty fsDirtyOn' : 'fsDirty'}>
            {saved.id ? (dirty ? 'есть несохранённое' : 'сохранено') : 'не в библиотеке'}
            {saved.id && ` · ${saved.status === 'published' ? 'опубликована' : 'черновик'}`}
          </span>
        </div>
        <div className="fsBtnBox" style={{ gap: 6 }}>
          {onApply && (
            <button className="fsBtn fsBtnPrimary" onClick={onApply} disabled={!canApply} title={canApply ? 'Положить сцену в ноду урока и закрыть' : 'Сначала исправьте ошибки линтера'}>
              Применить к ноде
            </button>
          )}
          <button className={onApply ? 'fsBtn' : 'fsBtn fsBtnPrimary'} onClick={() => onSave()} disabled={!canSave} title={library.missingTable ? 'Таблицы scenes нет — черновик хранится только на этом устройстве' : ''}>
            {library.busy ? 'Сохраняю…' : saved.id ? 'Сохранить' : 'Сохранить в библиотеку'}
          </button>
          {!askNew && <button className="fsBtn" onClick={reset}>Новая</button>}
          {askNew && (
            <span className="scbAsk" role="alert">
              Правки пропадут. <button className="fsBtn fsBtnSmall" onClick={reset}>Да, новая</button>
              <button className="fsBtn fsBtnSmall" onClick={() => setAskNew(false)}>Отмена</button>
            </span>
          )}
        </div>
      </div>
      {(status || restoredAt || errors.length > 0 || library.missingTable) && (
        <div className="fsMessages">
          {restoredAt && (
            <p className="fsMsg fsMsg-warn">
              Восстановлен черновик из резервной копии ({formatBackupTime(restoredAt)}) — правки не потерялись.{' '}
              <button className="scbLink" onClick={actions.dismissRestored}>Понятно</button>
            </p>
          )}
          {library.missingTable && <p className="fsMsg fsMsg-warn">Библиотека недоступна: таблицы scenes нет в базе — примените миграцию. Черновик сохраняется на этом устройстве.</p>}
          {errors.length > 0 && <p className="fsMsg fsMsg-error">Ошибок линтера: {errors.length} — сохранить черновик можно, опубликовать нельзя</p>}
          {status && <p className={`fsMsg fsMsg-${status.kind}`} role="status">{status.text}</p>}
        </div>
      )}
    </header>
  )
}
