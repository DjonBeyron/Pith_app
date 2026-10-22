import { useCallback, useEffect, useMemo, useState } from 'react'
import { listReviewMarks, addReviewMark, deleteReviewMark } from '../api/reviewMarksApi.js'

// Пометки урока (reviewMarksApi) для плеера (телефон, бейдж и окно пометки) и окна «Разбор» (ПК): список, карта по id ноды,
// добавить/удалить с мгновенным обновлением списка. enabled=false (не админ / нет урока) — ничего не грузит
export function useReviewMarks(lessonId, enabled = true) {
  const [marks, setMarks] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled || !lessonId) return undefined
    let dead = false
    listReviewMarks(lessonId).then(l => { if (!dead) setMarks(l) }, e => { if (!dead) setError(e?.message ?? 'ошибка') })
    return () => { dead = true }
  }, [lessonId, enabled])
  const byNode = useMemo(() => { const m = new Map(); for (const x of marks) m.set(x.nodeId, [...(m.get(x.nodeId) ?? []), x]); return m }, [marks])
  const add = useCallback(async mark => { const saved = await addReviewMark(mark); setMarks(l => [...l, saved]); return saved }, [])
  const remove = useCallback(async id => { await deleteReviewMark(id); setMarks(l => l.filter(x => x.id !== id)) }, [])
  return { marks, byNode, error, add, remove }
}
