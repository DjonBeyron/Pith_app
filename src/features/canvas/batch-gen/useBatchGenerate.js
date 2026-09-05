import { useState, useCallback, useRef } from 'react'
import { buildBatchPlan } from './batchGenPlan.js'
import { generateSpeech } from '../../../shared/lib/ttsApi.js'
import { generateImage } from '../../../shared/lib/imageGenApi.js'
import { analyzeWaveform, probeAudioDuration } from '../../../shared/lib/audioUtils.js'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

// Пакетная генерация озвучки/фото по всем нодам урока разом («⚡» в шапке
// холста, BatchGeneratePanel.jsx) — заполняет только то, чего ещё нет
// (готовые ноды buildBatchPlan пропускает молча, не как «ошибка»).
// Строго последовательно, не параллельно: бесплатные квоты ElevenLabs/
// Cloudflare не любят всплеск параллельных запросов, и только так честно
// считается ETA — по среднему времени уже обработанных элементов.
export function useBatchGenerate(boardApiRef, pickFile) {
  const [plan, setPlan] = useState(null) // null — ещё не строили план
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([]) // { seq, kind, status: 'done'|'error', message? }
  const [etaMs, setEtaMs] = useState(null)
  const cancelRef = useRef(false)

  const refreshPlan = useCallback(() => {
    const nodes = boardApiRef.current?.getNodes() ?? []
    setPlan(buildBatchPlan(nodes))
    setResults([])
    setEtaMs(null)
  }, [boardApiRef])

  const cancel = useCallback(() => { cancelRef.current = true }, [])

  const start = useCallback(async () => {
    if (!plan || running) return
    cancelRef.current = false
    setRunning(true)

    async function runAudio(item) {
      const { file, wordTimings } = await generateSpeech(item.text)
      const fileId = pickFile(file)
      const blobUrl = URL.createObjectURL(file)
      let waveformData = null, duration = null
      try {
        ;[waveformData, duration] = await Promise.all([analyzeWaveform(blobUrl), probeAudioDuration(blobUrl)])
      } finally {
        URL.revokeObjectURL(blobUrl)
      }
      boardApiRef.current.patchNodeTypeData(item.nodeId, data => (
        { ...data, file_id: fileId, waveformData, wordTimings, duration }
      ))
    }

    async function runPhoto(item) {
      const file = await generateImage(item.text)
      const fileId = pickFile(file)
      if (item.photoId) {
        // Вариант ноды photo_choice — свой fileId внутри массива photos,
        // не typeData.file_id напрямую (см. NodePhotoChoicePicker.jsx)
        boardApiRef.current.patchNodeTypeData(item.nodeId, data => ({
          ...data,
          photos: (data.photos ?? []).map(p => (p.id === item.photoId ? { ...p, fileId, photoUrl: null } : p)),
        }))
      } else {
        boardApiRef.current.patchNodeTypeData(item.nodeId, (data, node) => ({
          ...data,
          file_id: fileId,
          crop: DEFAULT_CROP,
          ...(node.type === 'sticker' ? { isVideo: false } : {}),
        }))
      }
    }

    const durations = []
    for (let i = 0; i < plan.items.length; i++) {
      if (cancelRef.current) break
      const item = plan.items[i]
      const t0 = Date.now()
      try {
        if (item.kind === 'audio') await runAudio(item)
        else await runPhoto(item)
        setResults(r => [...r, { seq: item.seq, kind: item.kind, status: 'done' }])
      } catch (e) {
        console.error('[BatchGenerate] failed', item, e)
        setResults(r => [...r, { seq: item.seq, kind: item.kind, status: 'error', message: e?.message ?? 'ошибка' }])
      }
      durations.push(Date.now() - t0)
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      const remaining = plan.items.length - (i + 1)
      setEtaMs(remaining > 0 ? Math.round(avg * remaining) : 0)
    }
    setRunning(false)
  }, [plan, running, pickFile, boardApiRef])

  return { plan, refreshPlan, running, results, etaMs, start, cancel }
}
