import { useState, useEffect, useRef } from 'react'
import { analyzeWaveform, probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { generateSpeech, getElevenLabsQuota } from '../../shared/lib/ttsApi.js'
import { StatusTag } from './NodeAudioPicker.jsx'

// Кнопка «Озвучить»: генерирует mp3 из текста ноды через ElevenLabs и
// заводит его в ноду ровно так же, как ручную загрузку файла (onPick) —
// дальше файл живёт по общим правилам: локальный кэш → синк урока → R2.
// Раз аудио генерируется из уже известного текста, ElevenLabs сразу отдаёт
// точные тайминги слов — отдельный шаг транскрипции (как для ручной
// загрузки, см. NodeAudioPicker) не нужен.
export default function NodeAudioTts({ fileId, text = '', onPick, onAnalyzed, onRemoveOldFile }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [quota,  setQuota]  = useState(null)    // { used, limit } | null — недоступно локально без секретов

  const onAnalyzedRef = useRef(onAnalyzed)
  useEffect(() => { onAnalyzedRef.current = onAnalyzed })

  useEffect(() => {
    getElevenLabsQuota().then(setQuota).catch(() => {})
  }, [])

  async function handleGenerate(e) {
    e.stopPropagation()
    const trimmed = text.trim()
    if (!trimmed || status === 'loading') return
    setStatus('loading')
    const prevFileId = fileId

    try {
      const { file, wordTimings } = await generateSpeech(trimmed)
      onPick(file)

      const blobUrl = URL.createObjectURL(file)
      try {
        const [waveformData, duration] = await Promise.all([
          analyzeWaveform(blobUrl),
          probeAudioDuration(blobUrl),
        ])
        onAnalyzedRef.current({ waveformData, duration, wordTimings })
      } finally {
        URL.revokeObjectURL(blobUrl)
      }

      // Перезаписываем: старый файл (если был) больше не нужен ноде
      if (prevFileId) onRemoveOldFile?.(prevFileId)

      setStatus('done')
      getElevenLabsQuota().then(setQuota).catch(() => {})
    } catch (err) {
      console.error('[NodeAudioTts] generate failed', err)
      setStatus('error')
    }
  }

  const remaining = quota ? Math.max(0, quota.limit - quota.used) : null

  return (
    <div className="nodeAudioTtsRow" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="nodeAudioTtsBtn"
        onClick={handleGenerate}
        disabled={!text.trim() || status === 'loading'}
        title="Сгенерировать голосовое из текста выше через ElevenLabs"
      >
        🔊 Озвучить
      </button>
      <StatusTag label="ElevenLabs" status={status} />
      {remaining != null && (
        <span className="nodeAudioTtsQuota">осталось {remaining.toLocaleString('ru-RU')} симв.</span>
      )}
    </div>
  )
}
