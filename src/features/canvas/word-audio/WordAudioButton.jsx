import { useState, useEffect, useCallback } from 'react'
import WordAudioPanel from './WordAudioPanel.jsx'
import { listWordAudio, cachedWordAudio, subscribeWordAudio, missingWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { scanAllLessons, subscribeWordScan, setLessonWords, clearLiveLesson, allLessonWords, wordScanReady, lessonWords } from '../../../shared/lib/wordAudio/wordAudioScan.js'
import { isAutoWordAudio, fillMissingWords } from './autoWordAudio.js'
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
    // Новые слова в канвасе видны в бейдже сразу (раз в 10 с), а после сохранения урока сами уходят в общую базу
    const timer = setInterval(syncLive, 10000)
    const off = onLessonSaved(saved => {
      if (saved.id !== lessonId) return
      syncLive()
      if (isAutoWordAudio()) fillMissingWords(lessonWords(lessonId))
    })
    return () => { off(); clearInterval(timer); clearLiveLesson(lessonId) }
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
