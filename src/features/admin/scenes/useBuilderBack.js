import { useState, useCallback } from 'react'
import { sameScene } from './builderModel.js'
import { backDecision, runBackChoice } from './toolbar/toolbarModel.js'

// Кнопка «← Назад» окна сборщика: то же, что закрытие окна, но при несохранённых правках
// сперва диалог внутри окна (BackConfirm: Сохранить / Не сохранять / Остаться). Esc этим
// не управляет — идёт прежней цепочкой (useBuilderUi) и закрывает окно сразу (в режиме
// админки правки не теряются: есть резервная копия в localStorage).
// «Несохранённое» (unsaved): сцена привязана к библиотеке → draft.dirty; не привязана →
// отличается от сцены при открытии окна (иначе в режиме ноды/модуля dirty был бы всегда true).
// onClose — закрытие окна (проверяет идущую озвучку), save — useBuilderActions.save → true/false.
export function useBuilderBack({ draft, voiceBusy, onClose, save }) {
  const [opened] = useState(() => draft.scene)
  const [ask, setAsk] = useState(false)
  const [saving, setSaving] = useState(false)
  const unsaved = draft.saved.snapshot ? draft.dirty : !sameScene(opened, draft.scene)

  const requestBack = useCallback(() => {
    const d = backDecision({ voiceBusy, dirty: unsaved })
    if (d === 'confirm') setAsk(true)
    else onClose() // blocked: onClose сам покажет «идёт озвучка»; close: закроет окно
  }, [voiceBusy, unsaved, onClose])

  const choose = useCallback(async choice => {
    if (choice === 'save') setSaving(true)
    else setAsk(false)
    await runBackChoice(choice, { save, close: onClose })
    setSaving(false)
    setAsk(false)
  }, [save, onClose])

  return { unsaved, ask, saving, requestBack, choose }
}
