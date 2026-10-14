import { useState, useEffect, useCallback } from 'react'
import {
  listScenes, getScene, saveScene, duplicateScene, deleteScene, renameScene, setSceneStatus, isMissingTable, isRightsError,
} from '../../../shared/api/scenesApi.js'

// Библиотека сцен («Мои сцены» в сборщике): список строк таблицы scenes и операции над
// ними. Мягкая деградация: таблицы нет (миграция не применена) → missingTable = true,
// список пуст, панель показывает «Примените миграцию scenes», сборщик продолжает работать
// с локальным черновиком (draftBackup.js). Ошибки — строкой по-русски в error.

const errText = e => {
  if (isMissingTable(e)) return 'Таблицы scenes нет в базе — примените миграцию 20261014140000_scenes.sql'
  if (isRightsError(e)) return 'Нет прав на запись (RLS): сцены сохраняет только админ'
  if (navigator.onLine === false) return 'Нет сети'
  return e?.message || 'Не удалось выполнить'
}

export function useSceneLibrary() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [missingTable, setMissingTable] = useState(false)
  const [busy, setBusy] = useState(false)

  // Состояние ставится только в колбэках после ответа сети (не синхронно в эффекте)
  const fetchList = useCallback(() => listScenes()
    .then(rows => { setItems(rows); setError(''); setMissingTable(false) })
    .catch(e => { setItems([]); setMissingTable(isMissingTable(e)); setError(errText(e)) })
    .finally(() => setLoading(false)), [])
  const refresh = useCallback(() => { setLoading(true); return fetchList() }, [fetchList])

  useEffect(() => { fetchList() }, [fetchList])

  // Обёртка операции: busy, ошибка по-русски, обновление списка; возвращает результат или null
  const run = useCallback(async fn => {
    setBusy(true)
    setError('')
    try {
      const out = await fn()
      await refresh()
      return out ?? true
    } catch (e) {
      setMissingTable(isMissingTable(e))
      setError(errText(e))
      return null
    } finally { setBusy(false) }
  }, [refresh])

  return {
    items, loading, error, missingTable, busy, refresh,
    save: ({ id, title, scene, status }) => run(() => saveScene({ id, title, scene, status })),
    open: id => run(() => getScene(id)),
    duplicate: id => run(() => duplicateScene(id)),
    remove: id => run(() => deleteScene(id)),
    rename: (id, title) => run(() => renameScene(id, title)),
    setStatus: (id, status) => run(() => setSceneStatus(id, status)),
    clearError: () => setError(''),
  }
}
