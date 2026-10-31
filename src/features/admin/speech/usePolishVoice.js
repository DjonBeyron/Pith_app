import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCatLines } from '../../../shared/api/catLinesApi.js'
import { listWordAudio, cachedWordAudio, subscribeWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { textRows } from '../../rehearsal/rehearsalTestForm.js'
import { pitVoiceCount, voiceMissingPitLines, voiceMissingTexts } from '../../rehearsal/rehearsalVoice.js'
import { chunkCount } from '../../rehearsal/polish/polishLines.js'

// Озвучка прямо в «Шлифовке репетиции» (Админ → «Голос»): реплики Пита (ElevenLabs → R2 → настройки приложения rotate_cat_lines, rehearsalVoice.js) и куски/слова плана (generateWordAudio: ElevenLabs → R2 → word_audio).
// Нужны права админа (запись в app_settings и word_audio). Хук держит загруженные реплики, библиотеку слов, прогресс («озвучиваю rh_start…») и текст ошибки; после озвучки реплик растёт rev — блок
// перемонтирует модуль игры, чтобы он взял свежие реплики (иначе новая озвучка зазвучит только после перезагрузки страницы). Зависимости подставляются в тестах.
export default function usePolishVoice({ plan, loadLines = getCatLines, voiceLines = voiceMissingPitLines, voiceTexts = voiceMissingTexts, generate = generateWordAudio }) {
  const [lines, setLines] = useState(null)               // реплики Пита (normalizeLines) или null — ещё не загрузились
  const [lib, setLib] = useState(() => cachedWordAudio()) // библиотека слов: Map ключ → строка
  const [rev, setRev] = useState(0)                      // растёт после озвучки реплик
  const [busy, setBusy] = useState('')                   // '' | 'lines' | 'chunks'
  const [step, setStep] = useState('')                   // что озвучивается сейчас (id реплики или ключ слова)
  const [error, setError] = useState('')                 // ошибка озвучки реплик
  const [chunkErrors, setChunkErrors] = useState({})     // ключ слова → ошибка

  useEffect(() => {
    let live = true
    loadLines().then(raw => { if (live) setLines(normalizeLines(raw)) }).catch(() => { if (live) setLines(normalizeLines(null)) })
    return () => { live = false }
  }, [loadLines, rev])
  useEffect(() => {
    listWordAudio().then(setLib).catch(() => {})
    return subscribeWordAudio(setLib)
  }, [])

  const rows = useMemo(() => (plan ? textRows(plan, lib) : []), [plan, lib])

  const voicePit = useCallback(async () => {
    setBusy('lines'); setError('')
    try { await voiceLines({ onStep: setStep }) } catch (e) { setError(e?.message || String(e)) }
    setStep(''); setBusy(''); setRev(n => n + 1)
  }, [voiceLines])

  const voiceChunks = useCallback(async () => {
    setBusy('chunks'); setChunkErrors({})
    const { failed } = await voiceTexts(rows, generate, setStep)
    setChunkErrors(failed); setStep(''); setBusy('')
  }, [voiceTexts, rows, generate])

  return { lines, rows, rev, busy, step, error, chunkErrors, pit: pitVoiceCount(lines), chunks: chunkCount(rows), voicePit, voiceChunks }
}
