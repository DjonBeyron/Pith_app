import { useState, useRef, useEffect } from 'react'
import { analyzeWaveform, probeAudioDuration } from '../../../shared/lib/audioUtils.js'

// Файл озвучки тренажёра в редакторе: id, волна, длительность, blob-URL для
// прослушивания. Только файл — воспроизведением ведают часы
// (useSpeechLaneClock.js), нарезкой — useAudioClipsEdit.js. Логика та же, что
// у useTimelineAudioSource таблицы: локальный File → свой blob-URL (снимаем
// при выходе), синхронный файл → r2Url; файл мог прийти в lessonFiles позже
// открытия окна (сразу после «🔊 Озвучить») — подхватываем эффектом.
export function useSpeechLaneFile({ fileId, waveformData, duration, lessonFiles, onPickFile }) {
  const [localFileId,   setLocalFileId]   = useState(fileId)
  const [localWave,     setLocalWave]     = useState(waveformData)
  const [localDuration, setLocalDuration] = useState(duration)
  const [localBlobUrl,  setLocalBlobUrl]  = useState(() => lessonFiles?.find(f => f.id === fileId)?.r2Url ?? null)
  const [analyzing,     setAnalyzing]     = useState(false)
  const ownedRef = useRef(null)

  useEffect(() => {
    if (localBlobUrl || !localFileId) return
    const f = lessonFiles?.find(lf => lf.id === localFileId)
    if (!f?.localFile) return
    const url = URL.createObjectURL(f.localFile)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    ownedRef.current = url
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalBlobUrl(url)
  }, [localFileId, lessonFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (ownedRef.current) URL.revokeObjectURL(ownedRef.current) }, [])

  async function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setAnalyzing(true)
    const id = onPickFile(f)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    const url = URL.createObjectURL(f)
    ownedRef.current = url
    const [wave, dur] = await Promise.all([analyzeWaveform(url), probeAudioDuration(url)])
    setLocalFileId(id); setLocalWave(wave); setLocalDuration(dur); setLocalBlobUrl(url)
    setAnalyzing(false)
  }

  function removeAudio() {
    if (!window.confirm('Убрать озвучку из тренажёра? Дорожки слов останутся.')) return
    if (ownedRef.current) { URL.revokeObjectURL(ownedRef.current); ownedRef.current = null }
    setLocalFileId(null); setLocalWave(null); setLocalDuration(null); setLocalBlobUrl(null)
  }

  const currentFile = lessonFiles?.find(f => f.id === localFileId) ?? null

  return { localFileId, localWave, localDuration, localBlobUrl, analyzing, currentFile, handleFileChange, removeAudio }
}
