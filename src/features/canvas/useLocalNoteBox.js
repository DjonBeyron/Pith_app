import { useCallback, useState } from 'react'

const KEY_PREFIX = 'pithy:noteBoxPos:'

function readStored(nodeId) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + nodeId)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Положение стикера с комментарием продакшена — чисто личное удобство: куда
// именно его подвинули на СВОЁМ экране, никого больше не касается и не
// должно уезжать в сохранённый урок (в отличие от текста заметки, node.note).
// Поэтому box живёт в localStorage, а не в node.noteBox — bump перерисовывает
// канвас после правки, сама позиция читается прямо из localStorage.
export function useLocalNoteBox() {
  const [, bump] = useState(0)

  const boxFor = useCallback(nodeId => readStored(nodeId), [])

  const setBoxFor = useCallback((nodeId, box) => {
    try { localStorage.setItem(KEY_PREFIX + nodeId, JSON.stringify(box)) } catch { /* приватный режим — тихо теряем */ }
    bump(v => v + 1)
  }, [])

  const clearBoxFor = useCallback(nodeId => {
    try { localStorage.removeItem(KEY_PREFIX + nodeId) } catch { /* приватный режим — тихо теряем */ }
    bump(v => v + 1)
  }, [])

  return { boxFor, setBoxFor, clearBoxFor }
}
