import { useEffect, useRef } from 'react'

// Журнал появления нод в переписке: во сколько нода показалась и был ли к
// этому моменту готов её медиа-блоб. Это диагностика предзагрузки — по нему
// видно, из-за чего сообщение «молчало»: файл не докачался, был вытеснен из
// кэша или упал с ошибкой. Уходит в «Скачать лог» (downloadDebugLog).
//
// Вынесено из LessonPlayer.jsx: к самому проигрыванию урока отношения не
// имеет, а места занимало больше, чем любая другая часть.
//
// openTimeRef приходит снаружи — момент открытия урока нужен не только здесь
// (по нему же считается время прохождения для супергонки).
export function useNodeAppearLog(visibleNodes, blobMap, addMsgTs, openTimeRef) {
  const prevVisibleRef   = useRef([])
  const nodeAppearLogRef = useRef([])

  useEffect(() => {
    const prevIds = new Set(prevVisibleRef.current.map(n => n.id))
    const newNodes = visibleNodes.filter(n => !prevIds.has(n.id))
    if (newNodes.length) {
      const t = `+${((Date.now() - openTimeRef.current) / 1000).toFixed(1)}`
      newNodes.forEach(n => {
        addMsgTs(n.seq, t)
        const fileId = n.typeData?.[n.type]?.file_id ?? null
        const entry  = fileId ? blobMap[fileId] : null
        nodeAppearLogRef.current.push({
          seq: n.seq, type: n.type, appearTs: t,
          blobReady:   !!entry?.blobUrl,
          blobEvicted: !!entry?.evicted,
          blobError:   !!entry?.error,
          hadBlob:     !!entry,
        })
      })
    }
    prevVisibleRef.current = visibleNodes
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  return nodeAppearLogRef
}
