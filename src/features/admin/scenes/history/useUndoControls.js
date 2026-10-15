import { useEffect, useRef, useCallback } from 'react'
import { undoKeyAction } from './undoKeys.js'

// Отмена/повтор в окне сборщика: кнопки тулбара и горячие клавиши зовут одни и те же undo/redo.
// После действия в строку статуса пишется «Отменено: …» / «Повторено: …». Горячие клавиши — слушатель
// на document (окно модальное и одно); enabled=false (открыт диалог поверх окна) отключает их.
export function useUndoControls({ history, setStatus, enabled = true }) {
  const ref = useRef(history)
  useEffect(() => { ref.current = history })

  const undo = useCallback(() => {
    const h = ref.current
    if (!h.canUndo) return
    const label = h.undoLabel
    h.undo()
    setStatus({ kind: 'ok', text: `Отменено: ${label}` })
  }, [setStatus])
  const redo = useCallback(() => {
    const h = ref.current
    if (!h.canRedo) return
    const label = h.redoLabel
    h.redo()
    setStatus({ kind: 'ok', text: `Повторено: ${label}` })
  }, [setStatus])

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = e => {
      const action = undoKeyAction(e)
      if (!action) return
      e.preventDefault()
      if (action === 'undo') undo(); else redo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, undo, redo])

  return { undo, redo, canUndo: history.canUndo, canRedo: history.canRedo, undoLabel: history.undoLabel, redoLabel: history.redoLabel }
}
