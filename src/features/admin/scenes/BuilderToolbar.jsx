import { useState, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { formatBackupTime } from './draftBackup.js'
import { sceneVoiceStats } from '../../scene/v2/sceneVoice.js'
import { sceneUseMode } from './ui/sceneUseOptions.js'
import { usePanels } from './ui/panelContext.js'
import { buildToolbarActions } from './toolbar/toolbarModel.js'
import { useNarrow } from './toolbar/useNarrow.js'
import SceneTitleField from './toolbar/SceneTitleField.jsx'
import { copyText } from './fileUtils.js'
import ToolbarActions from './toolbar/ToolbarActions.jsx'
import ToolbarStatus from './toolbar/ToolbarStatus.jsx'
import ScTip from './ScTip.jsx'
import UndoRedoButtons from './history/UndoRedoButtons.jsx'

// Верхняя панель сборщика, слева направо. Группа навигации: «← Назад» (закрытие окна; при несохранённых
// правках — диалог BackConfirm в BuilderWindow; в ноде/модуле — возврат без применения) и «↶ Отменить» /
// «↷ Повторить» (history/UndoRedoButtons); название окна; НАЗВАНИЕ СЦЕНЫ со статусом «Черновик · не сохранена»
// (toolbar/SceneTitleField, правка по клику; служебный id в шапке не показывается — «Копировать id сцены»
// в меню «Ещё»); индикаторы озвучки (ToolbarStatus); группы действий (ToolbarActions, список —
// toolbar/toolbarModel.js, добавить кнопку можно только там): Файл (Сохранить/Применить, Новая) | Просмотр и
// тест (режимы предпросмотра, «Проверить в ленте») | Озвучка («Озвучить ▾»), затем «Ещё» (⋯, меню с подписями
// по группам: Сохранить как…, Опубликовать/Снять, Свернуть все, тема, Копировать id) и «?». Окно уже
// NARROW_PX — на панели остаются «Назад», «Отменить», главное действие и «Ещё». Крестика нет: «Назад» его
// заменяет, Esc работает как раньше. Ниже — «Новая» с подтверждением прямо в тулбаре (confirm() браузер
// может блокировать), строка статуса (status.action — кнопка в строке, например «Отменить» после удаления
// сцены) и плашка «восстановлен черновик из резервной копии».
// onApply (нода/модуль) — «Применить» первой кнопкой; «Сохранить в библиотеку» остаётся отдельной.
export const NARROW_PX = 860

export default function BuilderToolbar({
  draft, library, status, setStatus, title = 'Сборщик сцен', onSave, onApply = null, applyLabel = 'Применить к ноде', useMode = null,
  onBack, backRef, theme, onToggleTheme, onSaveAs = null, onTogglePublish = null, undoCtl = null, unsaved = null, voice = null, modes = null, forceNarrow = null, menuOpen = false, onFeedTest = null,
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

  const allDone = st ? st.ready === st.total && st.translation.ready === st.translation.withText : false
  const list = buildToolbarActions({
    mode: sceneUseMode({ onApply, useMode }),
    voice: voice ? { run: sets => voice.openAll(sets), disabled: !!voice.busy, stats: st, hint: allDone ? 'Все реплики уже озвучены (текст и перевод)' : 'Озвучить реплики без актуального файла, по одной; стрелка — только текст / только перевод' } : null,
    modes,
    save: {
      label: library.busy ? 'Сохраняю…' : saved.id ? 'Сохранить' : 'Сохранить в библиотеку', run: () => onSave(), disabled: !canSave,
      hint: library.missingTable ? 'Таблицы scenes нет — черновик хранится только на этом устройстве' : 'Сохранить сцену в библиотеку',
    },
    apply: onApply ? { label: applyLabel, run: onApply, disabled: !canApply, hint: canApply ? 'Применить сцену и закрыть' : 'Сначала исправьте ошибки линтера' } : null,
    feedTest: onFeedTest ? { run: onFeedTest, hint: 'Привязать сцену к модулю ленты и открыть ленту с заданием' } : null,
    onNew,
    saveAs: onSaveAs ? { run: onSaveAs, disabled: !saved.id || !canSave, hint: saved.id ? 'Сохранить копию новой строкой: «Название (копия)»' : 'Сцены ещё нет в библиотеке — «Сохранить» создаст её' } : null,
    publish: onTogglePublish ? {
      label: saved.status === 'published' ? 'Снять с публикации' : 'Опубликовать', run: onTogglePublish, disabled: !saved.id || !canSave,
      hint: !saved.id ? 'Сначала сохраните сцену в библиотеку' : saved.status === 'published' ? 'Вернуть сцену в черновики — ученики её не увидят' : 'Показать сцену в ленте (только без ошибок линтера)',
    } : null,
    copyId: { run: async () => setStatus((await copyText(scene.id)) ? { kind: 'ok', text: `Служебный id скопирован: ${scene.id}` } : { kind: 'error', text: 'Не удалось скопировать id' }), hint: `служебный id: ${scene.id}` },
    panels: panels?.hasPanels(null) ? { has: true, allCollapsed: all, toggle: () => panels.setAll(null, !all) } : null,
    theme, onToggleTheme,
  })
  const remaining = voice?.quota ? Math.max(0, voice.quota.limit - voice.quota.used) : null

  return (
    <header ref={barRef} className="fsBar scbTb" data-narrow={narrow ? '1' : undefined}>
      <div className="fsBarRow scbTbRow">
        <div className="scbTbNav">
          <button ref={backRef} type="button" className="fsBtn scbBack" onClick={onBack} title="Назад: закрыть сборщик (Esc)">
            <ArrowLeft size={15} aria-hidden="true" />Назад
          </button>
          {undoCtl && <UndoRedoButtons ctl={undoCtl} />}
        </div>
        <span className="scbTbSep scbTbSepNav" role="separator" aria-orientation="vertical" />
        <h1 className="fsTitle">{title}</h1>
        <SceneTitleField title={scene.title} saved={saved} dirty={hasUnsaved} onChange={actions.setTitle} />
        <ToolbarStatus voice={st} quotaLeft={remaining} modes={modes?.overridden ?? null} />
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
          {status && (
            <p className={`fsMsg fsMsg-${status.kind}`} role="status">
              {status.text}
              {status.action && <> <button type="button" className="scbLink" data-action="status-action" onClick={status.action.run}>{status.action.label}</button></>}
            </p>
          )}
        </div>
      )}
    </header>
  )
}
