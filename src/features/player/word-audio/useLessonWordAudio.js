import { useEffect, useRef } from 'react'
import { listWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { collectLessonWords } from '../../../shared/lib/wordAudio/collectLessonWords.js'
import { preloadWordAudio, releaseWordAudio, setWordAudioMuted } from './wordAudioPlayer.js'
import { setSoundsMuted } from '../../../shared/lib/sounds.js'

// Через сколько после старта урока запускать дорожку слов, даже если прогрев
// первых нод так и не дошёл до 100% (сеть/ошибка файла) — слова не должны
// ждать вечно
const FALLBACK_MS = 6000

// Дорожка слов урока (wordAudioPlayer.js): при старте — список базы
// (гостю тоже, RLS select для всех), затем прогрев mp3 слов урока ПОСЛЕ
// прогрева первых нод (warmupPct=100) — чтобы не отбирать сеть у очереди
// файлов урока. При выходе из урока всё отпускается. muted — «Не могу слушать» в повторении: слова при тапах и
// звуки интерфейса (чат, «верно»/«неверно») не звучат
export function useLessonWordAudio(nodes, warmupPct, muted = false) {
  const startedRef = useRef(false)

  useEffect(() => {
    setWordAudioMuted(muted)
    setSoundsMuted(muted)
    return () => setSoundsMuted(false)
  }, [muted])

  useEffect(() => {
    listWordAudio()
    return () => { releaseWordAudio(); startedRef.current = false }
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    let alive = true // урок закрыли, пока ждали список озвучки — не прогревать
    const start = async () => {
      if (startedRef.current) return
      startedRef.current = true
      await listWordAudio()
      if (!alive) return
      preloadWordAudio([...collectLessonWords(nodes).keys()])
    }
    if (warmupPct >= 100) { start(); return () => { alive = false } }
    const t = setTimeout(start, FALLBACK_MS)
    return () => { alive = false; clearTimeout(t) }
  }, [warmupPct, nodes])
}
