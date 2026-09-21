import { useState, useEffect, useCallback } from 'react'
import WordAudioPanel from './WordAudioPanel.jsx'
import { listWordAudio, cachedWordAudio, subscribeWordAudio, missingWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { scanAllLessons, subscribeWordScan, setLessonWords, clearLiveLesson, allLessonWords, wordScanReady } from '../../../shared/lib/wordAudio/wordAudioScan.js'
import { onLessonSaved } from '../../../shared/lib/lessonSavedBus.js'

// Кнопка 🔊 в шапке канваса (только админ) с бейджем — сколько слов из ВСЕХ
// уроков ещё не озвучено (решение: бейдж по всем урокам). Открытый урок
// считается по живым нодам холста (setLessonWords) — при открытии, после
// каждого сохранения (lessonSavedBus) и при закрытии меню; остальные — по
// снимку скриптов (wordAudioScan.js, один раз на сессию).
export default function WordAudioButton({ lessonId, title, boardApiRef, loading }) {
  const [open,  setOpen]  = useState(false)
  const [count, setCount] = useState(null)

  const syncLive = useCallback(() => {
    if (loading) return
    setLessonWords(lessonId, title, boardApiRef.current?.getNodes() ?? [])
  }, [lessonId, title, boardApiRef, loading])

  useEffect(() => {
    listWordAudio()
    if (!wordScanReady()) scanAllLessons()
    const recount = () => {
      const lib = cachedWordAudio()
      if (!lib || !wordScanReady()) { setCount(null); return }
      const wanted = new Map([...allLessonWords()].map(([k, v]) => [k, v.text]))
      setCount(missingWordAudio(wanted, lib).size)
    }
    recount()
    const u1 = subscribeWordAudio(recount)
    const u2 = subscribeWordScan(recount)
    return () => { u1(); u2() }
  }, [])

  useEffect(() => {
    syncLive()
    const off = onLessonSaved(saved => { if (saved.id === lessonId) syncLive() })
    return () => { off(); clearLiveLesson(lessonId) }
  }, [syncLive, lessonId])

  return (
    <>
      <span className="canvasSettingsBtnWrap">
        <button
          className="canvasPageBatchGen"
          title={count ? `Озвучка слов: не озвучено ${count}` : 'Озвучка слов — библиотека произношений'}
          disabled={loading}
          onClick={() => { syncLive(); setOpen(true) }}
        >🔊</button>
        {count > 0 && <span className="warBadge">{count > 99 ? '99+' : count}</span>}
      </span>
      {open && <WordAudioPanel lessonId={lessonId} onClose={() => { setOpen(false); syncLive() }} />}
    </>
  )
}
