import { useState, useEffect, useRef, useCallback } from 'react'
import { transcribeAudio } from '../../../shared/lib/transcribeApi.js'
import { autoLayoutCoach } from '../../../shared/lib/speechLaneTiming.js'

// «🪄 Смонтировать» в тренажёре: каждому слою диктора — по вылету на каждое
// звучание его слова в озвучке (speechLaneTiming.autoLayoutCoach). Слои
// ученика не трогает. Тайминги слов — из кэша ноды (ElevenLabs отдаёт их
// вместе с mp3, см. NodeTableTts), иначе Groq-транскрипция, как у таблицы
// (useTableAutoMontage.js). Кэш сбрасывается только при смене файла.
export function useSpeechLaneMontage({ layers, audioClips, localFileId, lessonFiles, timelineLen, initialWordTimings, replaceLayers }) {
  const [wordTimings, setWordTimings] = useState(initialWordTimings ?? null)
  const [montaging, setMontaging] = useState(false)
  const prevFileIdRef = useRef(localFileId)

  useEffect(() => {
    if (prevFileIdRef.current === localFileId) return
    prevFileIdRef.current = localFileId
    setWordTimings(null)
  }, [localFileId])

  const runMontage = useCallback(async () => {
    if (!localFileId || montaging) return
    if (!window.confirm('Расставить вылеты слов диктора по озвучке автоматически? Их текущие клипы будут переписаны, слои ученика не тронутся.')) return
    setMontaging(true)
    try {
      let wt = wordTimings
      if (!wt) {
        const file = lessonFiles?.find(f => f.id === localFileId)
        const source = file?.localFile ? { file: file.localFile } : { url: file?.r2Url }
        wt = await transcribeAudio(source)
        setWordTimings(wt)
      }
      replaceLayers(autoLayoutCoach(layers, wt, audioClips, timelineLen))
    } catch (e) {
      console.error('[useSpeechLaneMontage] failed', e)
      window.alert('Не удалось расставить автоматически: ' + (e?.message ?? 'неизвестная ошибка'))
    } finally {
      setMontaging(false)
    }
  }, [localFileId, montaging, wordTimings, lessonFiles, layers, audioClips, timelineLen, replaceLayers])

  return { wordTimings, montaging, runMontage }
}
