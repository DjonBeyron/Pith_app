import { useCallback, useEffect, useRef } from 'react'

// Озвучка слова в шторке «Слово голосом → картинка»: при открытии сама играет слово из word_audio, «Послушать ещё» —
// заново. url — адрес mp3 слова или null (звука нет: хук ничего не делает). Автоигра может не пройти без касания
// (iOS) — тогда человек жмёт кнопку, исключение глотается. → replay
export function useWordVoice(url) {
  const audio = useRef(null)

  useEffect(() => {
    if (!url) return undefined
    const a = new Audio(url)
    audio.current = a
    a.play().catch(() => { /* нужен жест — кнопка «Послушать» остаётся */ })
    return () => { a.pause(); audio.current = null }
  }, [url])

  return useCallback(() => {
    const a = audio.current
    if (!a) return
    a.currentTime = 0
    a.play().catch(() => {})
  }, [])
}
