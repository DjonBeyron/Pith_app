import { useEffect, useRef } from 'react'
import { listWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { collectLessonWords } from '../../../shared/lib/wordAudio/collectLessonWords.js'
import { preloadWordAudio, releaseWordAudio } from './wordAudioPlayer.js'

// Через сколько после старта урока запускать дорожку слов, даже если прогрев
// первых нод так и не дошёл до 100% (сеть/ошибка файла) — слова не должны
// ждать вечно
const FALLBACK_MS = 6000

// Дорожка слов урока (wordAudioPlayer.js): при старте — список базы
// (гостю тоже, RLS select для всех), затем прогрев mp3 слов урока ПОСЛЕ
// прогрева первых нод (warmupPct=100) — чтобы не отбирать сеть у очереди
// файлов урока. При выходе из урока всё отпускается
export function useLessonWordAudio(nodes, warmupPct) {
  const startedRef = useRef(false)

  useEffect(() => {
    listWordAudio()
    return () => { releaseWordAudio(); startedRef.current = false }
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    const start = async () => {
      if (startedRef.current) return
      startedRef.current = true
      await listWordAudio()
      preloadWordAudio([...collectLessonWords(nodes).keys()])
    }
    if (warmupPct >= 100) { start(); return }
    const t = setTimeout(start, FALLBACK_MS)
    return () => clearTimeout(t)
  }, [warmupPct, nodes])
}
