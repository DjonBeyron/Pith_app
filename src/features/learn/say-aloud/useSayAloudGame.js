import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import { createLevelSource } from '../../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../../shared/lib/vosk/sayVoskLevel.js'
import { getGameMic, hasGameMic, dropGameMic, openGameMic } from '../../../shared/lib/gameMic.js'
import { createWordListener } from '../../player/modules/rotate-phone/wordLaneListen.js'
import { sensitiveLevel } from '../../player/modules/rotate-phone/wordLaneConfig.js'
import { pLog } from '../../../shared/lib/debug.js'
import { flowReduce, initFlow, answersOf, holdMs, WORD_MS, ROUND_MS } from './sayAloudFlow.js'

// Сценарий мини-игры «Скажи вслух»: слушатель Vosk (тот же, что в «Повтори за диктором») со словарём из ВСЕХ слов раунда, плюс таймеры слова и раунда.
// Один слушатель на раунд: он копит номера услышанных слов (seq), редьюсер (sayAloudFlow.js) решает, засчитано ли текущее слово. Таймеры идут с первого «слушаю»:
// пока модель и микрофон поднимаются, время ученика не тратится. Распознавание ТОЛЬКО Vosk: не поднялся — игра честно говорит об этом (fail), ручного режима и системного распознавания нет.
const NOTE_MS = 2600

export function useSayAloudGame({ words, onFinished }) {
  const [s, dispatch] = useReducer(flowReduce, words.length, initFlow)
  const [status, setStatus] = useState('starting')   // starting | listening
  const [armed, setArmed] = useState(false)          // микрофон хоть раз заработал — таймеры пошли
  const [note, setNote] = useState('')
  const [fail, setFail] = useState(false)
  const [epoch, setEpoch] = useState(0)              // растёт, когда микрофон переоткрыт: слушатель пересоздаётся
  const [rms] = useState(() => createRmsLevel({ fromRms: sensitiveLevel }))
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))
  const catApi = useRef(null)
  const missRef = useRef(0)
  const noteTimer = useRef(0)
  const startRef = useRef(0)
  const doneRef = useRef(false)

  useEffect(() => {
    missRef.current = 0
    const l = createWordListener({
      targets: words.map(w => w.word), expected: words.length, maxWords: 2, level: rms, getStream: getGameMic,
      onChange: ({ status: st, seq, misses, heard }) => {
        if (st === 'dead') { // игровой поток оглох (iOS заглушил) — переоткрываем микрофон и слушаем заново
          if (hasGameMic()) { pLog('[say-aloud] поток отдаёт тишину — переоткрываю'); dropGameMic(); openGameMic().then(r => { if (r === 'granted') setEpoch(e => e + 1) }) }
          return
        }
        if (st === 'unavailable' || st === 'error') { setFail(true); return }
        if (st === 'listening' || st === 'starting') setStatus(st)
        if (st === 'listening') setArmed(true)
        dispatch({ type: 'hear', seq })
        if (misses > missRef.current) {
          missRef.current = misses
          setNote(`Услышал: «${heard || '…'}»`)
          clearTimeout(noteTimer.current)
          noteTimer.current = setTimeout(() => setNote(''), NOTE_MS)
        }
      },
    })
    l.start() // нет модели → 'unavailable' → fail: к этому моменту useVoskReady уже подтвердили, что модель в памяти
    return () => { l.dispose(); clearTimeout(noteTimer.current) }
  }, [words, rms, epoch])

  // Время: слово — WORD_MS, пауза после ответа, потолок раунда
  useEffect(() => {
    if (!armed) return undefined
    if (s.mode === 'ask') { const t = setTimeout(() => dispatch({ type: 'timeout' }), WORD_MS); return () => clearTimeout(t) }
    if (s.mode === 'ok' || s.mode === 'miss') { const t = setTimeout(() => dispatch({ type: 'advance' }), holdMs(s.mode)); return () => clearTimeout(t) }
    return undefined
  }, [armed, s.mode, s.idx])
  useEffect(() => {
    if (!armed) return undefined
    startRef.current = performance.now()
    const t = setTimeout(() => dispatch({ type: 'finish' }), ROUND_MS)
    return () => clearTimeout(t)
  }, [armed])

  // Пит реагирует лицом на ответ
  useEffect(() => {
    if (s.mode === 'ok') catApi.current?.react('love', 1100)
    else if (s.mode === 'miss') catApi.current?.react('shy', 1600)
  }, [s.mode, s.idx])

  useEffect(() => {
    if (s.mode !== 'done' || doneRef.current) return
    doneRef.current = true
    onFinished?.({ answers: answersOf(words, s), ms: Math.round(startRef.current ? performance.now() - startRef.current : 0) })
  }, [s, words, onFinished])

  const skip = useCallback(() => dispatch({ type: 'skip' }), [])
  return { s, status, note, fail, levels, catApi, skip }
}
