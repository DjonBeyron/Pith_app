import { useState, useEffect, useCallback } from 'react'
import {
  listTableTemplates, createTableTemplate, renameTableTemplate, deleteTableTemplate,
} from '../../../shared/api/tableTemplatesApi.js'
import { readLegacyTemplates, clearLegacyTemplates } from './tableTemplates.js'

// Список шаблонов таблиц с сервера + операции над ними. Источник правды —
// Supabase, локально ничего не кэшируем: шаблон, сохранённый на одной машине,
// должен быть виден на другой (и в любом уроке) сразу.
export function useTableTemplates() {
  const [templates, setTemplates] = useState([])
  const [busy,  setBusy]  = useState(true)
  const [error, setError] = useState(null)

  const run = useCallback(async (fn) => {
    setBusy(true)
    try {
      await fn()
      setTemplates(await listTableTemplates())
      setError(null)
    } catch (e) {
      setError(e?.message ?? 'Не удалось связаться с сервером')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const legacy = readLegacyTemplates()
        // Разовый переезд шаблонов из localStorage (см. tableTemplates.js)
        for (const t of legacy) await createTableTemplate(t.name, t.table)
        if (legacy.length) clearLegacyTemplates()
        const list = await listTableTemplates()
        if (alive) { setTemplates(list); setError(null) }
      } catch (e) {
        if (alive) setError(e?.message ?? 'Не удалось загрузить шаблоны')
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const save   = useCallback((name, table) => run(() => createTableTemplate(name, table)), [run])
  const rename = useCallback((id, name)    => run(() => renameTableTemplate(id, name)),    [run])
  const remove = useCallback(id            => run(() => deleteTableTemplate(id)),          [run])

  return { templates, busy, error, save, rename, remove }
}
