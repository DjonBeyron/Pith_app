import { useState, useMemo } from 'react'
import { findField, fieldSection } from './lintFieldMap.js'
import { panelKeysFor } from './lintPanelMap.js'

// Действия окна сборщика над черновиком и библиотекой: сохранить (в библиотеку, статус по
// умолчанию — текущий), открыть строку, подсветить поле по замечанию линтера (раскрыв
// свёрнутые панели на пути — lintPanelMap). Строка статуса окна — здесь же.
export function useBuilderActions({ draft, library }) {
  const [status, setStatus] = useState(null) // { kind: 'ok' | 'warn' | 'error', text }

  return useMemo(() => {
    // true — сохранено (нужно диалогу «Назад»: выйти только после успешного сохранения)
    const save = async statusOverride => {
      const { scene, saved } = draft
      const title = scene.title?.trim() || 'Без названия'
      const row = await library.save({ id: saved.id, title, scene, status: statusOverride ?? saved.status })
      if (row) { draft.actions.markSaved(row); setStatus({ kind: 'ok', text: `Сохранено в библиотеку: «${row.title}» (${row.status === 'published' ? 'опубликована' : 'черновик'})` }); return true }
      setStatus({ kind: 'error', text: library.error || 'Не удалось сохранить' })
      return false
    }
    const openRow = async id => {
      const row = await library.open(id)
      if (row?.scene) { draft.actions.load(row.scene, row); setStatus({ kind: 'ok', text: `Открыта «${row.title}»` }); return row }
      if (row === null) setStatus({ kind: 'error', text: library.error || 'Не удалось открыть' })
      return null
    }
    // expand(keys) — развернуть панели на пути; setView — на телефоне переключить на «Настройки».
    // Поле ищется после перерисовки (панели только что развернулись)
    const highlight = (text, { expand, setView } = {}) => {
      expand?.(panelKeysFor(text))
      const go = () => {
        const el = findField(text, document)
        if (!el) return
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.setAttribute('data-flash', '1')
        setTimeout(() => el.removeAttribute('data-flash'), 1600)
        if (typeof el.focus === 'function' && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) el.focus({ preventScroll: true })
      }
      if (window.innerWidth < 1100 && fieldSection(text) && setView) { setView('settings'); setTimeout(go, 60) } else setTimeout(go, 30)
    }
    return { status, setStatus, save, openRow, highlight }
  }, [draft, library, status])
}
