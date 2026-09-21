import { useState, useEffect, useCallback, useRef } from 'react'
import { listWordAudio, cachedWordAudio, subscribeWordAudio, saveWordAudio, deleteWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { scanAllLessons, subscribeWordScan, lessonWords, allLessonWords, wordScanReady } from '../../../shared/lib/wordAudio/wordAudioScan.js'
import { generateSpeech, getElevenLabsQuota } from '../../../shared/lib/ttsApi.js'
import { probeAudioDuration } from '../../../shared/lib/audioUtils.js'
import { dbg } from '../../../shared/lib/debug.js'

// Состояние меню 🔊 «Озвучка слов» в канвасе: библиотека (word_audio),
// слова открытого урока и всех уроков (wordAudioScan.js), очередь генерации
// через ElevenLabs. Генерация — ПОСЛЕДОВАТЕЛЬНО, по одному слову: параллель
// упирается в лимит запросов ElevenLabs и мешает показать честный прогресс.
// Каждое готовое слово сразу уезжает в R2 + базу — остановка на середине
// ничего не теряет.
export function useWordAudioLibrary(lessonId) {
  const [lib,   setLib]   = useState(() => cachedWordAudio())
  const [, bump]          = useState(0)
  const [quota, setQuota] = useState(null)
  const [busy,  setBusy]  = useState(null)   // { key, done, total } — идёт генерация
  const [errors, setErrors] = useState({})   // key → текст ошибки
  const cancelRef = useRef(false)

  useEffect(() => {
    listWordAudio()
    if (!wordScanReady()) scanAllLessons()
    getElevenLabsQuota().then(setQuota).catch(() => {})
    const u1 = subscribeWordAudio(setLib)
    const u2 = subscribeWordScan(() => bump(n => n + 1))
    return () => { u1(); u2() }
  }, [])

  const refreshScan = useCallback(() => scanAllLessons(true), [])

  // Одно слово: mp3 из TTS → длительность → R2 + база
  async function generateOne(key, text) {
    const { file } = await generateSpeech(text)
    const url = URL.createObjectURL(file)
    const duration = await probeAudioDuration(url).catch(() => null)
    URL.revokeObjectURL(url)
    await saveWordAudio({ key, text, blob: file, duration, source: 'tts' })
  }

  // items — [{ key, text }]; идёт по очереди, ошибки копятся по словам
  async function generateMany(items) {
    if (busy || !items.length) return
    cancelRef.current = false
    setBusy({ key: items[0].key, done: 0, total: items.length })
    let done = 0
    for (const { key, text } of items) {
      if (cancelRef.current) break
      setBusy({ key, done, total: items.length })
      try {
        await generateOne(key, text)
        setErrors(e => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n })
      } catch (e) {
        dbg('[word tts]', key, e.message)
        setErrors(prev => ({ ...prev, [key]: e.message }))
      }
      done += 1
    }
    setBusy(null)
    getElevenLabsQuota().then(setQuota).catch(() => {})
  }

  function cancel() { cancelRef.current = true }

  // Файл админа вместо TTS (или поверх него)
  async function uploadOne(key, text, file) {
    const url = URL.createObjectURL(file)
    const duration = await probeAudioDuration(url).catch(() => null)
    URL.revokeObjectURL(url)
    try {
      await saveWordAudio({ key, text, blob: file, duration, source: 'upload' })
      setErrors(e => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n })
    } catch (e) {
      setErrors(prev => ({ ...prev, [key]: e.message }))
    }
  }

  async function remove(key) {
    try { await deleteWordAudio(key) } catch (e) { setErrors(prev => ({ ...prev, [key]: e.message })) }
  }

  return {
    lib, quota, busy, errors,
    thisLesson: lessonWords(lessonId),
    allLessons: allLessonWords(),
    scanReady: wordScanReady(),
    refreshScan, generateMany, cancel, uploadOne, remove,
  }
}
