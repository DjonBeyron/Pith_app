import { useState, useEffect, useRef, useCallback } from 'react'
import { transcribeAudio } from '../../../shared/lib/transcribeApi.js'
import { buildCellTargets, buildWordTargets, matchWordTimingsToTargets } from './autoMontage.js'

// Кнопка «🪄 Смонтировать»: расставляет подсветку слоёв таймлайна диктанта
// по реальному времени слов в озвучке — черновик, который дальше можно
// поправить руками как обычно (это те же updateClip/toggleHighlight, что и
// у ручной правки, ничем не помечены как «авто»).
//
// Тайминги слов кэшируются в typeData.table.wordTimings (вызывающий код
// сохраняет их вместе с остальными полями таблицы) — повторный клик после
// правки текста ячейки или сценария не бьёт по Groq снова, only пересчитывает
// сопоставление на уже полученных таймингах. Кэш сбрасывается сам, только
// когда аудио реально заменили (fileId изменился) — не при каждом маунте.
export function useTableAutoMontage({
  cells, layers, localFileId, lessonFiles, timelineDur,
  initialWordTimings, updateClip, toggleHighlight,
}) {
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
    if (!window.confirm('Расставить подсветку ячеек по озвучке автоматически? Уже выставленные вручную клипы будут переписаны.')) return
    setMontaging(true)
    try {
      let wt = wordTimings
      if (!wt) {
        const file = lessonFiles?.find(f => f.id === localFileId)
        const source = file?.localFile ? { file: file.localFile } : { url: file?.r2Url }
        wt = await transcribeAudio(source)
        setWordTimings(wt)
      }

      const wordKeys = layers.filter(l => l.word).map(l => l.word)
      const targets = [...buildCellTargets(cells), ...buildWordTargets(wordKeys)]
      const matches = matchWordTimingsToTargets(wt, targets)

      for (const layer of layers) {
        const key = layer.cellId ?? layer.word
        if (!key) continue
        const match = matches.get(key)
        if (match) {
          updateClip(layer.id, { start: match.start, end: match.end ?? timelineDur }, 0)
          if (layer.cellId && !layer.highlightOn) toggleHighlight(layer.id)
        } else if (layer.cellId && layer.highlightOn) {
          // Не прозвучало буквально (обычно заголовок) — гасим подсветку,
          // чтобы не мигала не в такт со старым дефолтным клипом
          toggleHighlight(layer.id)
        }
      }
    } catch (e) {
      console.error('[useTableAutoMontage] failed', e)
      window.alert('Не удалось расставить автоматически: ' + (e?.message ?? 'неизвестная ошибка'))
    } finally {
      setMontaging(false)
    }
  }, [localFileId, montaging, wordTimings, lessonFiles, layers, cells, timelineDur, updateClip, toggleHighlight])

  return { wordTimings, montaging, runMontage }
}
