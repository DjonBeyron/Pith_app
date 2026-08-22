import { useState, useEffect } from 'react'
import TableChatBubble from './TableChatBubble.jsx'
import { useMissingMediaFallback } from '../../useMissingMediaFallback.js'

// Таблица в режиме «Показ»: приходит в ленту обычным сообщением от учителя —
// пузырь во всю ширину чата с уголком слева, — а не выкатывающейся снизу
// панелью. Ученик ничего не отвечает: посмотрел и цепочка идёт дальше.
//
// Аудио необязательно: есть файл — таблица «озвучена» и переход по окончании
// записи (триггер played), нет — нода живёт по таймеру, как текстовая.
export default function TableDemoModule({ node, file, onDone, pending = false, adminPreview = false }) {
  const tData = node.typeData?.table ?? {}
  const table = tData.table ?? null
  const [objectUrl, setObjectUrl] = useState(null)

  // Локальный файл (урок ещё не синхронизирован) играется из самого File
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? tData.r2Url ?? null

  // Автор ещё не приложил запись, а сценарий смотрит админ — отпускаем цепочку
  // заглушкой, как у остальных нод без медиа
  useMissingMediaFallback(adminPreview && !src && !pending, onDone)

  // Без аудио вообще: показ держит таймер ноды, цепочке мешать нечем
  useEffect(() => {
    if (src || adminPreview || pending) return
    onDone?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, pending])

  return (
    <TableChatBubble table={table}>
      {src && (
        <audio
          src={src}
          autoPlay={!pending}
          preload="auto"
          onEnded={() => onDone?.()}
        />
      )}
    </TableChatBubble>
  )
}
