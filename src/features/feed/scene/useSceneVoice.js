import { useEffect, useMemo, useRef } from 'react'
import { useSayPhrase } from '../../player/panels/say-phrase/useSayPhrase.js'
import { voiceSayData } from './sceneVoiceData.js'
import { failKind } from './sceneVoiceState.js'

// Связка хука «Сказать фразу» (useSayPhrase: микрофон, Vosk / системное распознавание, разрешения, попапы) с состоянием панели задания
// ленты. Хук получает «фразу» из voiceSayData(info): грамматика Vosk — taskGrammar, проверка — checkSpeechAnswer (data.judge). Аналитику
// say_phrase_* он здесь НЕ шлёт (onEvent не передан): у ленты свои scene_task_* (useSceneTask.voiceResult).
// Фазы хука переводятся в действия панели только на границах (запись началась / итог / отмена) — никаких обновлений на тик уровня
// микрофона: уровень — подписка эквалайзера (SayStage), React его не видит.
// act = { voiceListen, voiceUnlisten, voiceResult } — стабильные обёртки useSceneTask.
export function useSceneVoice({ info, act }) {
  const data = useMemo(() => voiceSayData(info), [info])
  const sp = useSayPhrase({ data })
  const was = useRef(sp.phase)
  const spRef = useRef(sp)
  useEffect(() => { spRef.current = sp })
  useEffect(() => {
    const before = was.current
    was.current = sp.phase
    if (before === sp.phase) return
    const cur = spRef.current
    if (sp.phase === 'run') act.voiceListen()
    else if (before !== 'run') return
    else if (sp.phase === 'passed') act.voiceResult({ ok: true, heard: cur.verdict?.heard ?? '', engine: cur.engine })
    else if (sp.phase === 'failed') act.voiceResult({ ok: false, heard: cur.verdict?.heard ?? '', engine: cur.engine, ...failKind({ verdict: cur.verdict, errorCode: cur.errorCode }) })
    else act.voiceUnlisten() // запись прервали (сворачивание, отказ микрофона, отмена): попытка не потрачена
  }, [sp.phase, act])
  return sp
}
