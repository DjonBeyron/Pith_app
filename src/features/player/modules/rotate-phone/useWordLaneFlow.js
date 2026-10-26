import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { createWordListener } from './wordLaneListen.js'
import { speakWord, playTrack, stopVoice } from './wordLaneVoice.js'
import { playNote, releaseNotes } from './wordLaneNotes.js'
import { makeListenPlan } from './wordLanePlan.js'
import { audioPlayingMs } from './wordLaneClock.js'
import { DROP_MS, LANES_MS, TURN_MS } from './wordLaneTimeline.js'
import { XP_PER_PILL } from './wordLaneConfig.js'

// Сценарий игры «Повтори за диктором» по фазам (каждая — свой эффект с таймерами, смена фазы чистит их). ВСЕ таймеры фазы считаются от ОДНОЙ точки — s.phaseAt (её же берёт движок пилюль),
// иначе голос и картинка расходились бы на время между сменой фазы и запуском эффекта:
//  drop    слово падает сверху и замирает
//  lanes   проявляются три дорожки
//  listen  конвейер: пилюли катятся вниз с постоянной скоростью, диктор озвучивает каждую, пока она проходит центр, заливка в такт речи, щелчок. С озвучкой автора файл включается один раз
//          (wordLanePlan.audioAt) и дальше ведёт картинку по своему currentTime (wordLaneClock), без озвучки — слово из библиотеки/системы в момент каждого слова плана
//  turn    плашка «Теперь твоя очередь» (последняя пилюля диктора ещё докатывается)
//  speak   выезжает микрофон; конвейер ученика (wordLaneStudent): пилюли выкатываются сами, ученик успевает сказать слово или нет — распознавание (wordLaneListen) принимает слова,
//          движок решает судьбу пилюль; все дорожки закрыты → finished
//  reveal  перевод слова; «Дальше» отпускает ноду
// Микрофон в speak включается сам (доступ дан заранее, в карточке/запуске урока). Нет модели Vosk или микрофон не открылся — ручной режим: тап по микрофону = «сказал слово».
const EXIT_PAUSE_MS = 1700 // все дорожки закрыты: заливка доходит до конца, щелчок, нота, последняя пилюля уезжает — и только потом перевод

export function useWordLaneFlow({ word, lang, fills = null, audioSrc = null, audio = null, catApi = null, onFinished }) {
  const plan = useMemo(() => makeListenPlan(audioSrc ? fills : null, audio), [fills, audioSrc, audio])
  const [s, setS] = useState({ phase: 'drop', phaseAt: 0, xp: 0, xpEvents: [], note: '', hits: 0, misses: 0, mic: 'starting' })
  const phaseRef = useRef('drop')
  const listenerRef = useRef(null)
  const finishedRef = useRef(false)
  const audioElRef = useRef(null) // <audio> озвучки автора, пока она играет: по его currentTime идут пилюли
  const revealTimerRef = useRef(0)
  const xpIdRef = useRef(0)
  const noteTimerRef = useRef(0)
  const [rms] = useState(createRmsLevel)                                  // громкость голоса ученика (кольца микрофона)
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))

  const go = useCallback((phase, patch = null) => { phaseRef.current = phase; setS(p => ({ ...p, ...patch, phase, phaseAt: performance.now() })) }, [])

  // Реакции игры (зовёт движок пилюль, useWordLanePills):
  //  win(order) — принята пилюля ученика: +XP_PER_PILL (цифра летит вверх, как в чате урока), нота order (выше предыдущей; на время ноты слушатель не засчитывает «чужие слова»), кот радуется;
  //  miss — чужое слово: кот отводит взгляд, а ученику честно показываем, что услышал движок («Услышал: …»);
  //  fail — не успел: пилюля ушла вниз без слова;
  //  mouth(level) — рот кота по голосу; audioMs — currentTime озвучки автора в мс (или null); finished — все дорожки закрыты → перевод.
  const flash = text => { clearTimeout(noteTimerRef.current); setS(p => ({ ...p, note: text })); noteTimerRef.current = setTimeout(() => setS(p => ({ ...p, note: '' })), 2600) }
  const [fx] = useState(() => ({
    win(order, rect) {
      if (playNote(order)) listenerRef.current?.mute(900)
      catApi?.current?.react('love', 1600)
      catApi?.current?.peek?.()
      const id = ++xpIdRef.current
      setS(p => ({ ...p, xpEvents: [...p.xpEvents, { id, amount: XP_PER_PILL, rect }] }))
    },
    miss() { catApi?.current?.react('shy', 1300) },
    fail() { catApi?.current?.react('shy', 1300); flash('Не успел — говори, пока пилюля на экране') },
    mouth(level) { catApi?.current?.mouth(level) },
    audioMs: () => audioPlayingMs(audioElRef.current),
    finished() { if (!revealTimerRef.current) revealTimerRef.current = setTimeout(() => go('reveal'), EXIT_PAUSE_MS) },
  }))

  // XP долетел до верха — прибавляем к счётчику
  const dismissXp = useCallback(id => setS(p => {
    const ev = p.xpEvents.find(e => e.id === id)
    return ev ? { ...p, xp: p.xp + ev.amount, xpEvents: p.xpEvents.filter(e => e.id !== id) } : p
  }), [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopVoice()
    releaseNotes()
    listenerRef.current?.dispose()
    onFinished?.()
  }, [onFinished])

  // Модель Vosk уже в памяти: её держит ранний прогрев урока (useLessonWarmups считает и ноду rotate_phone); здесь только уборка за собой
  useEffect(() => () => { stopVoice(); releaseNotes(); clearTimeout(noteTimerRef.current); clearTimeout(revealTimerRef.current); listenerRef.current?.dispose() }, [])

  useEffect(() => {
    const { phase } = s
    if (phase === 'drop') { const t = setTimeout(() => go('lanes'), DROP_MS); return () => clearTimeout(t) }
    if (phase === 'lanes') { const t = setTimeout(() => go('listen'), LANES_MS); return () => clearTimeout(t) }
    if (phase === 'listen') {
      // Единая точка отсчёта — s.phaseAt (как у движка пилюль): задержка между сменой фазы и запуском эффекта не сдвигает голос относительно картинки
      const left = at => Math.max(0, at - (performance.now() - s.phaseAt))
      const ids = []
      if (plan.audioAt == null) plan.fillAt.forEach(at => ids.push(setTimeout(() => speakWord(word, lang), left(at)))) // без озвучки автора — голос слова в начале каждого слова плана
      else ids.push(setTimeout(() => { audioElRef.current = playTrack(audioSrc) }, left(plan.audioAt))) // озвучка автора — одним файлом, дальше картинка идёт по нему
      ids.push(setTimeout(() => go('turn'), left(plan.listenMs)))
      return () => { ids.forEach(clearTimeout); if (audioElRef.current && phaseRef.current !== 'turn') audioElRef.current = null }
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
      onChange: ({ status, hits, misses, heard }) => {
        setS(p => ({
          ...p, hits: Math.max(p.hits, hits), misses: Math.max(p.misses, misses),
          // Чужое слово: ученику честно показываем, что услышал движок (на 2,6 с вместо подписи у микрофона)
          note: misses > p.misses ? `Услышал: «${heard || '…'}» — нужно «${word}»` : p.note,
          mic: status === 'listening' || status === 'starting' ? status : status === 'idle' ? p.mic : 'manual',
        }))
        if (misses > 0) { clearTimeout(noteTimerRef.current); noteTimerRef.current = setTimeout(() => setS(p => ({ ...p, note: '' })), 2600) }
      },
    })
    listenerRef.current = l
    l.start() // нет модели → onChange 'unavailable' → ручной режим
    return () => { l.dispose(); if (listenerRef.current === l) listenerRef.current = null }
  }, [s.phase, word, rms])

  /** Тап по микрофону: в ручном режиме (распознавания нет) — «слово сказано» */
  const tapMic = useCallback(() => {
    if (phaseRef.current !== 'speak') return
    setS(p => (p.mic === 'manual' ? { ...p, hits: p.hits + 1 } : p))
  }, [])

  const skip = useCallback(() => { listenerRef.current?.dispose(); clearTimeout(revealTimerRef.current); go('reveal') }, [go])

  return { ...s, plan, levels, fx, dismissXp, tapMic, skip, finish }
}
