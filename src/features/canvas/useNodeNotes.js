import { useState, useCallback } from 'react'

// Комментарии продакшена на нодах: сам текст живёт в ноде (node.note), здесь
// только «что сейчас свёрнуто». Свёрнутый стикер не теряет текст — он просто
// не занимает место на холсте, пока автор не развернёт его снова.
export function useNodeNotes(updateNode) {
  const [hidden, setHidden] = useState(() => new Set())

  // 📝 в меню ноды: заметки нет — заводим пустую и сразу показываем;
  // есть — сворачиваем/разворачиваем стикер
  const toggleNote = useCallback((nodeId, hasNote) => {
    if (!hasNote) {
      setHidden(prev => { const s = new Set(prev); s.delete(nodeId); return s })
      updateNode(nodeId, { note: '' })
      return
    }
    setHidden(prev => {
      const s = new Set(prev)
      if (s.has(nodeId)) s.delete(nodeId); else s.add(nodeId)
      return s
    })
  }, [updateNode])

  const isNoteOpen = useCallback(
    node => node.note != null && !hidden.has(node.id), [hidden])
  const isNoteFolded = useCallback(
    node => node.note != null && hidden.has(node.id), [hidden])

  return { toggleNote, isNoteOpen, isNoteFolded }
}
