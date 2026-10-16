import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applySceneToNode, addSceneNode, runRowAction, ROW_ACTIONS } from './sceneTabOps.js'

// Действия строк вкладки «Сцены» поверх boardApiRef канваса (ноды живут в CanvasBoard).
// Сборщик: edit(id) → editing { id, scene, view } → apply(scene) пишет снимок в ноду, closeEditor без apply
// ничего не меняет. Объект handlers стабилен (строки не перерисовываются зря) — onClose/onPlayFrom читаются через ref.
export function useSceneTabActions({ boardApiRef, onClose, onPlayFrom }) {
  const [editing, setEditing] = useState(null)
  const [added, setAdded] = useState(null) // id только что добавленной ноды — строку подсветим
  const cb = useRef({ onClose, onPlayFrom })
  useEffect(() => { cb.current = { onClose, onPlayFrom } })

  const run = useCallback(
    (kind, id) => runRowAction(kind, boardApiRef.current, id, cb.current, setEditing), [boardApiRef])
  const handlers = useMemo(
    () => Object.fromEntries(ROW_ACTIONS.map(k => [k, id => run(k, id)])), [run])

  const apply = useCallback(scene => {
    const id = editing?.id
    setEditing(null)
    applySceneToNode(boardApiRef.current, id, scene)
  }, [editing, boardApiRef])

  const add = useCallback(td => {
    const id = addSceneNode(boardApiRef.current, td)
    if (id) setAdded(id)
  }, [boardApiRef])

  const closeEditor = useCallback(() => setEditing(null), [])
  const clearAdded = useCallback(() => setAdded(null), [])
  return { handlers, editing, closeEditor, apply, add, added, clearAdded }
}
