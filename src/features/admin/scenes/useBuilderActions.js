import { useState, useMemo } from 'react'
import { findField, fieldSection } from './lintFieldMap.js'
import { panelKeysFor } from './lintPanelMap.js'
import { asCopy, cleanTitle, titleOrPlaceholder } from '../../scene/v2/sceneNaming.js'

// Действия окна сборщика над черновиком и библиотекой: сохранить (в библиотеку, статус по
// умолчанию — текущий), открыть строку, подсветить поле по замечанию линтера (раскрыв
// свёрнутые панели на пути — lintPanelMap). Строка статуса окна — здесь же.
export function useBuilderActions({ draft, library, initialStatus = null }) {
  const [status, setStatus] = useState(initialStatus) // { kind: 'ok' | 'warn' | 'error', text }

  return useMemo(() => {
    // строка библиотеки (truthy) — сохранено (нужно диалогу «Назад»: выйти только после успешного сохранения)
    const save = async statusOverride => {
      const { scene, saved } = draft
      const title = titleOrPlaceholder(scene.title) // колонка scenes.title = scene.title (1–80); пустое → «Без названия» + ошибка линтера
      // Опубликованная сцена с ошибками линтера (например, без реплик) в ленту попасть не должна: сохранить можно как черновик
      if ((statusOverride ?? saved.status) === 'published' && draft.errors.length) {
        setStatus({ kind: 'error', text: `Сначала исправьте ошибки линтера (${draft.errors.length}) — опубликованную сцену с ошибками сохранить нельзя; сохраните как черновик` })
        return false
      }
      const row = await library.save({ id: saved.id, title, scene: { ...scene, title: cleanTitle(scene.title) }, status: statusOverride ?? saved.status })
      if (row) { draft.actions.markSaved(row); setStatus({ kind: 'ok', text: `Сохранено в библиотеку: «${row.title}» (${row.status === 'published' ? 'опубликована' : 'черновик'})` }); return row }
      setStatus({ kind: 'error', text: library.error || 'Не удалось сохранить' })
      return false
    }
    // «Сохранить как…»: «Название (копия)» новой строкой-черновиком (не накапливает -copy-copy), текущая строка не меняется
    const saveAs = async () => {
      const copy = asCopy(draft.scene)
      const row = await library.save({ id: null, title: titleOrPlaceholder(copy.title), scene: copy, status: 'draft' })
      if (row) { draft.actions.adoptSaved(copy, row); setStatus({ kind: 'ok', text: `Сохранено как новая: «${row.title}» (черновик)` }); return row }
      setStatus({ kind: 'error', text: library.error || 'Не удалось сохранить копию' })
      return false
    }
    // Опубликовать / снять с публикации сцену сборщика (строка уже в библиотеке); публиковать с ошибками линтера нельзя
    const togglePublish = async () => {
      const { saved } = draft
      if (!saved.id) { setStatus({ kind: 'warn', text: 'Сначала сохраните сцену в библиотеку' }); return false }
      const next = saved.status === 'published' ? 'draft' : 'published'
      if (next === 'published' && draft.errors.length) { setStatus({ kind: 'error', text: `Сначала исправьте ошибки линтера (${draft.errors.length}) — опубликовать нельзя` }); return false }
      const r = await library.setStatus(saved.id, next)
      if (!r) { setStatus({ kind: 'error', text: library.error || 'Не удалось изменить статус' }); return false }
      draft.actions.markSaved(r)
      setStatus({ kind: 'ok', text: next === 'published' ? 'Опубликована: сцена доступна в ленте' : 'Снята с публикации: теперь черновик' })
      return r
    }
    const openRow = async id => {
      const row = await library.open(id)
      // название строки библиотеки = название сцены (старые строки могли разойтись с scene.title)
      if (row?.scene) { draft.actions.load({ ...row.scene, title: row.title || row.scene.title }, row); setStatus({ kind: 'ok', text: `Открыта «${row.title}»` }); return row }
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
    return { status, setStatus, save, saveAs, togglePublish, openRow, highlight }
  }, [draft, library, status])
}
