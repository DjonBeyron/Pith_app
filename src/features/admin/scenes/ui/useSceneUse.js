import { useState, useCallback } from 'react'
import { copyText } from '../fileUtils.js'

// Действия меню «Использовать» (UseSceneMenu) над строкой библиотеки: apply — отдать сцену
// хосту (нода урока / модуль ленты: onApply(scene, { id, status }), окно закроет хост),
// open — открыть в сборщике, copy — дубликат и открыть его, link — диалог привязки к модулю
// ленты (LinkModuleDialog, состояние linkRow), copyId / copyJson — в буфер. Статусы — в строку
// статуса окна через setStatus. Полную строку (со сценой) всегда тянем через library.open —
// в списке сцен есть только заголовки.
export function useSceneUse({ library, onOpenRow, onApply, setStatus }) {
  const [linkRow, setLinkRow] = useState(null)

  const act = useCallback(async (id, row) => {
    const full = async () => {
      const r = await library.open(row.id)
      if (!r?.scene) setStatus({ kind: 'error', text: library.error || 'Не удалось загрузить сцену' })
      return r?.scene ? r : null
    }
    switch (id) {
      case 'apply': {
        const r = await full()
        if (r && onApply) onApply(r.scene, { id: r.id, status: r.status })
        return
      }
      case 'open': await onOpenRow(row.id); return
      case 'copy': {
        const created = await library.duplicate(row.id)
        if (created?.id) { await onOpenRow(created.id); setStatus({ kind: 'ok', text: `Открыта копия «${created.title}» — исходная сцена не тронута` }) }
        return
      }
      case 'link': setLinkRow(row); return
      case 'copyId':
        setStatus((await copyText(row.id)) ? { kind: 'ok', text: `id скопирован: ${row.id}` } : { kind: 'error', text: 'Не удалось скопировать id' })
        return
      case 'copyJson': {
        const r = await full()
        if (r) setStatus((await copyText(JSON.stringify(r.scene, null, 2))) ? { kind: 'ok', text: `JSON сцены «${r.title}» скопирован` } : { kind: 'error', text: 'Не удалось скопировать JSON' })
        return
      }
      default:
    }
  }, [library, onOpenRow, onApply, setStatus])

  return { act, linkRow, closeLink: () => setLinkRow(null) }
}
