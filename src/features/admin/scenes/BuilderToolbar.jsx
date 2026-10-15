import { useState, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { formatBackupTime } from './draftBackup.js'
import { sceneVoiceStats } from '../../scene/v2/sceneVoice.js'
import { sceneUseMode } from './ui/sceneUseOptions.js'
import { usePanels } from './ui/panelContext.js'
import { buildToolbarActions } from './toolbar/toolbarModel.js'
import { useNarrow } from './toolbar/useNarrow.js'
import ToolbarActions from './toolbar/ToolbarActions.jsx'
import ToolbarStatus from './toolbar/ToolbarStatus.jsx'
import ScTip from './ScTip.jsx'

// Верхняя панель сборщика, слева направо: «← Назад» (закрытие окна; при несохранённых правках —
// диалог BackConfirm в BuilderWindow; в нодe/модуле — возврат без применения), название окна,
// поля «Название»/«id» сцены, индикаторы (ToolbarStatus), группа действий (ToolbarActions:
// «Озвучить всё» | «Применить»/«Сохранить»/«Новая» | «Свернуть все»/тема, затем «?»). Кнопки
// описывает toolbar/toolbarModel.js — добавить новую можно только там. Окно уже NARROW_PX —
// остаются главное действие и меню «⋯». Крестика нет: «Назад» его заменяет, Esc работает как раньше.
// Ниже — «Новая» с подтверждением прямо в тулбаре (confirm() браузер может блокировать),
// строка статуса и плашка «восстановлен черновик из резервной копии».
// onApply (нода/модуль) — «Применить» первой кнопкой; «Сохранить в библиотеку» остаётся отдельной.
export const NARROW_PX = 860

export default function BuilderToolbar({
  draft, library, status, setStatus, title = 'Сборщик сцен', onSave, onApply = null, applyLabel = 'Применить к ноде', useMode = null,
  onBack, backRef, theme, onToggleTheme, unsaved = null, voice = null, forceNarrow = null, menuOpen = false,
}) {
  const { scene, saved, dirty, errors, restoredAt, actions } = draft
  const [askNew, setAskNew] = useState(false)
  const barRef = useRef(null)
  const narrow = useNarrow(barRef, NARROW_PX, forceNarrow)
  const panels = usePanels()
  const canSave = !library.busy && !library.missingTable
  const canApply = !!onApply && errors.length === 0
  const hasUnsaved = unsaved ?? dirty
  const st = voice ? sceneVoiceStats(scene) : null
  const reset = () => {
    setAskNew(false)
    actions.reset()
    setStatus(null)
  }
  const onNew = () => { if (dirty) setAskNew(true); else reset() }
  const all = panels?.allCollapsed(null)

  const list = buildToolbarActions({
    mode: sceneUseMode({ onApply, useMode }),
    voice: voice ? { run: voice.openAll, disabled: voice.busy || st.ready === st.total, hint: st.ready === st.total ? 'Все реплики уже озвучены' : 'Озвучить реплики без актуального файла, по одной' } : null,
    save: {
      label: library.busy ? 'Сохраняю…' : saved.id ? 'Сохранить' : 'Сохранить в библиотеку', run: () => onSave(), disabled: !canSave,
      hint: library.missingTable ? 'Таблицы scenes нет — черновик хранится только на этом устройстве' : 'Сохранить сцену в библиотеку',
    },
    apply: onApply ? { label: applyLabel, run: onApply, disabled: !canApply, hint: canApply ? 'Применить сцену и закрыть' : 'Сначала исправьте ошибки линтера' } : null,
    onNew,
    panels: panels?.hasPanels(null) ? { has: true, allCollapsed: all, toggle: () => panels.setAll(null, !all) } : null,
    theme, onToggleTheme,
  })
  const remaining = voice?.quota ? Math.max(0, voice.quota.limit - voice.quota.used) : null

  return (
    <header ref={barRef} className="fsBar scbTb" data-narrow={narrow ? '1' : undefined}>
      <div className="fsBarRow scbTbRow">
        <button ref={backRef} type="button" className="fsBtn scbBack" onClick={onBack} title="Назад: закрыть сборщик (Esc)">
          <ArrowLeft size={15} aria-hidden="true" />Назад
        </button>
        <h1 className="fsTitle">{title}</h1>
        <label className="scbField scbFieldTitle">
          <span className="scbFieldLabel">Название</span>
          <input id="f-title" className="fsNote" value={scene.title} maxLength={60} onChange={e => actions.setTitle(e.target.value)} placeholder="Например: Кофе-брейк" />
        </label>
        <label className="scbField scbFieldId">
          <span className="scbFieldLabel">id</span>
          <input id="f-id" className="fsNote scbMono" value={scene.id} maxLength={40} onChange={e => actions.setId(e.target.value)} spellCheck={false} />
        </label>
        <ToolbarStatus saved={saved} unsaved={hasUnsaved} voice={st} quotaLeft={remaining} />
        <ToolbarActions actions={list} narrow={narrow} menuOpen={menuOpen} extra={<ScTip help="panels" />} />
      </div>
      {askNew && (
        <div className="scbAsk" role="alert">
          Правки пропадут. <button type="button" className="fsBtn fsBtnSmall" onClick={reset}>Да, новая</button>
          <button type="button" className="fsBtn fsBtnSmall" onClick={() => setAskNew(false)}>Отмена</button>
        </div>
      )}
      {(status || restoredAt || errors.length > 0 || library.missingTable) && (
        <div className="fsMessages">
          {restoredAt && (
            <p className="fsMsg fsMsg-warn">
              Восстановлен черновик из резервной копии ({formatBackupTime(restoredAt)}) — правки не потерялись.{' '}
              <button type="button" className="scbLink" onClick={actions.dismissRestored}>Понятно</button>
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
