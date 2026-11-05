import { useState, useEffect, useMemo, useCallback } from 'react'
import { listWordAudio, cachedWordAudio, subscribeWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'
import { voiceMissingTexts } from '../../rehearsal/rehearsalVoice.js'
import { transTexts, transRows } from '../../pitrace/raceTrans.js'

// Озвучка русских переводов «Разгона» в блоке «Гонка с Питом (стенд)»: те же ElevenLabs (голос Пита, язык по тексту) → R2 → библиотека слов, ключ `ru:перевод` (raceTrans.js).
// Набор — переводы слов плана и extraWords. Нужны права админа. done / total — «озвучено N из M»; voice() озвучивает недостающие по одному (voiceMissingTexts).
export default function useTransVoice({ plan, texts = transTexts, voiceTexts = voiceMissingTexts, generate = generateWordAudio }) {
  const [lib, setLib] = useState(() => cachedWordAudio())
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [errors, setErrors] = useState({})
  useEffect(() => {
    listWordAudio().then(setLib).catch(() => {})
    return subscribeWordAudio(setLib)
  }, [])
  const rows = useMemo(() => (plan ? transRows(texts(plan), lib) : []), [plan, lib, texts])
  const voice = useCallback(async () => {
    setBusy(true); setErrors({})
    const { failed } = await voiceTexts(rows, generate, setStep)
    setErrors(failed); setStep(''); setBusy(false)
  }, [voiceTexts, rows, generate])
  return { rows, busy, step, errors, done: rows.filter(r => r.has).length, total: rows.length, voice }
}
