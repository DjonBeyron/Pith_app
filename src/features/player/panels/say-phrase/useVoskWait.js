import { useState, useRef, useCallback, useEffect } from 'react'

// Админский режим «Только Vosk» в панели «Сказать фразу» (sayVoskWait.js): на тапе, пока Vosk не готов, вместо системного распознавания — ожидание прогрева. Этап и итог идут в серую плашку
// админа над панелью (note — такой же { text, note, title }, как у sayAdmin.js). wait(data) → true: тап «съеден» ожиданием (попытку не начинаем); false: ждать не нужно, обычная попытка.
export function useVoskWait(ctrl) {
  const [note, setNote] = useState(null)
  const cancelRef = useRef(null)
  const wait = useCallback(data => {
    cancelRef.current?.()
    cancelRef.current = ctrl.waitVosk(data, setNote)
    if (!cancelRef.current) setNote(null)
    return !!cancelRef.current
  }, [ctrl])
  useEffect(() => () => cancelRef.current?.(), [])
  return { note, wait }
}
