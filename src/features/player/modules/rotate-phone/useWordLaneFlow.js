import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { createWordListener } from './wordLaneListen.js'
import { speakWord, playTrack, stopVoice } from './wordLaneVoice.js'
import { makeListenPlan } from './wordLanePlan.js'
import { DROP_MS, LANES_MS, TURN_MS, SLOT_COUNT } from './wordLaneTimeline.js'

// Сценарий игры «Повтори за диктором» по фазам (каждая — свой эффект с таймерами, смена фазы чистит их):
//  drop    слово падает сверху и замирает
//  lanes   проявляются три дорожки со слоями
//  listen  пилюли по очереди опускаются в центр; диктор озвучивает каждую, пилюля заливается синхронно с речью, щёлкает и уходит вниз. Расписание — wordLanePlan.makeListenPlan: по умолчанию фиксированное (слово из библиотеки/системы),
//          с озвучкой ElevenLabs — по таймлайну ноды (fills): файл включается один раз, слово k начинается, когда пилюля k стоит в зоне голоса; пилюли идут по очереди
//  turn    плашка «Теперь твоя очередь», пилюли пустеют
//  speak   выезжает микрофон, пилюли опускаются снова; ученик говорит слово SLOT_COUNT раз — пилюля наполняется его голосом, распознавание (wordLaneListen) её защёлкивает
//  reveal  перевод слова; «Дальше» отпускает ноду
// Микрофон в speak включается сам (доступ дан заранее, в карточке/запуске урока). Нет модели Vosk или микрофон не открылся — ручной режим: тап по микрофону = «сказал слово».
const EXIT_PAUSE_MS = 1700 // после третьего слова ученика: заливка доходит до конца (LOCK_MS), щелчок, пилюля уходит вниз (EXIT_MS) — и только потом перевод

export function useWordLaneFlow({ word, lang, fills = null, audioSrc = null, audio = null, onFinished }) {
  const plan = useMemo(() => makeListenPlan(audioSrc ? fills : null, audio), [fills, audioSrc, audio])
  const [s, setS] = useState({ phase: 'drop', phaseAt: 0, hits: 0, misses: 0, mic: 'starting' })
  const phaseRef = useRef('drop')
  const listenerRef = useRef(null)
  const finishedRef = useRef(false)
  const [rms] = useState(createRmsLevel)                                  // громкость голоса ученика (кольца микрофона)
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))

  const go = useCallback((phase, patch = null) => { phaseRef.current = phase; setS(p => ({ ...p, ...patch, phase, phaseAt: performance.now() })) }, [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopVoice()
    listenerRef.current?.dispose()
    onFinished?.()
  }, [onFinished])

  // Модель Vosk уже в памяти: её держит ранний прогрев урока (useLessonWarmups считает и ноду rotate_phone); здесь только уборка за собой
  useEffect(() => () => { stopVoice(); listenerRef.current?.dispose() }, [])

  useEffect(() => {
    const { phase } = s
    if (phase === 'drop') { const t = setTimeout(() => go('lanes'), DROP_MS); return () => clearTimeout(t) }
    if (phase === 'lanes') { const t = setTimeout(() => go('listen'), LANES_MS); return () => clearTimeout(t) }
    if (phase === 'listen') {
      const t0 = performance.now()
      const ids = plan.fillAt.map(at => setTimeout(() => {
        if (plan.audioAt == null) speakWord(word, lang) // без озвучки автора каждое слово — отдельный голос (в момент входа линии в пилюлю)
      }, Math.max(0, at - (performance.now() - t0))))
      if (plan.audioAt != null) ids.push(setTimeout(() => playTrack(audioSrc), plan.audioAt)) // озвучка автора — одним файлом
      ids.push(setTimeout(() => go('turn'), plan.listenMs))
      return () => ids.forEach(clearTimeout)
    }
    if (phase === 'turn') {
      const t = setTimeout(() => go('speak'), TURN_MS)
      return () => clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, word, lang, go, plan, audioSrc])

  // speak: слушатель живёт всю фазу
  useEffect(() => {
    if (s.phase !== 'speak') return undefined
    const l = createWordListener({
      word,
      level: rms,
      onChange: ({ status, hits, misses }) => setS(p => ({
        ...p, hits: Math.max(p.hits, hits), misses: Math.max(p.misses, misses),
        mic: status === 'listening' || status === 'starting' || status === 'done' ? status : status === 'idle' ? p.mic : 'manual',
      })),
    })
    listenerRef.current = l
    l.start() // нет модели → onChange 'unavailable' → ручной режим
    return () => { l.dispose(); if (listenerRef.current === l) listenerRef.current = null }
  }, [s.phase, word, rms])

  // Три слова приняты → последняя пилюля уходит вниз → перевод
  useEffect(() => {
    if (s.phase !== 'speak' || s.hits < SLOT_COUNT) return undefined
    const t = setTimeout(() => go('reveal'), EXIT_PAUSE_MS)
    return () => clearTimeout(t)
  }, [s.phase, s.hits, go])

  /** Тап по микрофону: в ручном режиме (распознавания нет) — «слово сказано» */
  const tapMic = useCallback(() => {
    if (phaseRef.current !== 'speak') return
    setS(p => (p.mic === 'manual' && p.hits < SLOT_COUNT ? { ...p, hits: p.hits + 1 } : p))
  }, [])

  const skip = useCallback(() => { listenerRef.current?.dispose(); go('reveal') }, [go])

  return { ...s, plan, levels, tapMic, skip, finish }
}
