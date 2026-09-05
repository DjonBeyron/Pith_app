import { useState, useEffect } from 'react'
import { generateSpeech, getElevenLabsQuota } from '../../shared/lib/ttsApi.js'
import { analyzeWaveform, probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { StatusTag } from './NodeAudioPicker.jsx'

// Кнопка «🔊 Озвучить» для таблицы в режиме «Авто» (диктатор) — тот же
// генератор, что у audio-ноды (NodeAudioTts.jsx), только источник текста —
// script (что проговаривает голос), а не отдельное поле. wordTimings из
// ответа ElevenLabs сразу кладём в tData.wordTimings — «🪄 Смонтировать»
// (useTableAutoMontage.js) увидит их в кэше и не пойдёт транскрибировать
// через Groq заново: тайминги уже есть, просто с другого источника.
export default function NodeTableTts({ fileId, text = '', onPick, onAnalyzed, onRemoveOldFile }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [quota,  setQuota]  = useState(null)    // { used, limit } | null — та же квота, что у NodeAudioTts

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
        onAnalyzed({ waveformData, duration, wordTimings })
      } finally {
        URL.revokeObjectURL(blobUrl)
      }

      if (prevFileId) onRemoveOldFile?.(prevFileId)
      setStatus('done')
      getElevenLabsQuota().then(setQuota).catch(() => {})
    } catch (err) {
      console.error('[NodeTableTts] generate failed', err)
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
        title="Сгенерировать озвучку из текста сценария выше"
      >
        🔊 Озвучить
      </button>
      <StatusTag label="AI" status={status} />
      {remaining != null && (
        <span className="nodeAudioTtsQuota">осталось {remaining.toLocaleString('ru-RU')} симв.</span>
      )}
    </div>
  )
}
