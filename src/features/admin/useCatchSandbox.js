import { useMemo, useRef, useState, useEffect } from 'react'
import { catchHeard, catchHelp } from '../../shared/api/catchApi.js'
import { catchWords, catchSignal } from '../feed/catch/feedCatch.js'
import { catchKeyboard } from '../feed/catch/catchLetters.js'
import * as cs from '../feed/catch/catchState.js'

const WRONG_FLASH_MS = 700
const LOG_MAX = 40
// Шаг и «постоянная память» для каждого уровня песочницы (0 — слова нет в памяти)
const STEP_OF_LEVEL = { 1: 1, 2: 3, 3: 5, 4: 5 }

// Знание песочницы из выбранных уровней: levels — { [index слова]: 0..4 }; baseWords — слова фразы
function sandboxKnowledge(baseWords, levels, defaultIndex) {
  const stepOf = new Map()
  const settledOf = new Set()
  for (const w of baseWords) {
    const lvl = levels[w.index] ?? (w.index === defaultIndex ? 2 : 0)
    if (!lvl || !w.key) continue
    stepOf.set(w.key, STEP_OF_LEVEL[lvl])
    if (lvl === 4) settledOf.add(w.key)
  }
  return { stepOf, settledOf }
}

// Состояние песочницы «Ловли»: те же чистые переходы catchState.js, что и в useSlideCatch, но без ленты,
// лимитов, lock и аналитики. Уровни слов задаёт админ (по умолчанию все 0, первое слово — 2).
// writeMemory — слать ли реальные сигналы (catchHeard/catchHelp) в СВОЮ память; иначе только лог.
// → { words, levels-доступ, ownCount, current, typed, helped, model, st, wrongFlash, log, memoryNote, ... }
export function useCatchSandbox({ title, moduleId, writeMemory }) {
  const baseWords = useMemo(() => catchWords(title, null), [title])
  const defaultIndex = baseWords[0]?.index ?? -1
  const [levels, setLevels] = useState({}) // { index: 0..4 }, пусто — значения по умолчанию
  const [st, setSt] = useState(() => cs.initialCatch(moduleId))
  const [wrongFlash, setWrongFlash] = useState(false)
  const [log, setLog] = useState([])
  const [memoryNote, setMemoryNote] = useState('')
  const flashT = useRef(0)
  useEffect(() => () => clearTimeout(flashT.current), [])

  const knowledge = useMemo(() => sandboxKnowledge(baseWords, levels, defaultIndex), [baseWords, levels, defaultIndex])
  const words = useMemo(() => catchWords(title, knowledge), [title, knowledge])

  const addLog = text => setLog(l => [text, ...l].slice(0, LOG_MAX))

  // Другая фраза — всё с нуля (сброс при рендере, как в useSlideCatch)
  const [seenKey, setSeenKey] = useState(`${moduleId}|${title}`)
  const key = `${moduleId}|${title}`
  if (seenKey !== key) {
    setSeenKey(key)
    setLevels({})
    setSt(cs.initialCatch(moduleId))
    setLog([])
    setMemoryNote('')
  }

  const current = st.current == null ? null : cs.wordAt(words, st.current)
  const helped = st.current != null && st.helped.has(st.current)
  const model = useMemo(() => (current ? catchKeyboard(current.text, current.level) : null), [current])

  const levelOf = w => levels[w.index] ?? (w.index === defaultIndex ? 2 : 0)
  const setLevel = (index, level) => setLevels(l => ({ ...l, [index]: level }))

  const reset = () => {
    clearTimeout(flashT.current)
    setWrongFlash(false)
    setSt(cs.initialCatch(moduleId))
    setLog([])
    setMemoryNote('')
  }

  function unflash() { if (wrongFlash) setWrongFlash(false) }

  // Сигнал в память: пишем только при включённом переключателе; результат — jsonb как текст
  function signal(kind, w) {
    if (!writeMemory) { addLog(`${kind === 'help' ? 'Помочь памяти' : 'Услышано'}: «${w.text}» (в память не пишем)`); return }
    const call = kind === 'help' ? catchHelp : catchHeard
    call(w.key, moduleId)
      .then(r => setMemoryNote(`${kind} «${w.key}» → ${JSON.stringify(r)}`))
      .catch(e => setMemoryNote(`${kind} «${w.key}» → ошибка: ${e?.message ?? e}`))
    addLog(`${kind === 'help' ? 'Помочь памяти' : 'Услышано'}: «${w.text}» → в память`)
  }

  const pickWord = index => {
    setSt(p => cs.pickWord(p, words, index))
    const w = cs.wordAt(words, index)
    if (w) addLog(`Выбрано слово «${w.text}» (уровень ${w.level})`)
  }
  const press = ch => { unflash(); setSt(p => cs.press(p, words, ch)) }
  const backspace = () => { unflash(); setSt(cs.backspace) }

  function help() {
    if (!current || helped || st.done) return
    setSt(cs.help)
    if (catchSignal(current.level, true) === 'help') signal('help', current)
    else addLog(`Помочь памяти: «${current.text}» (уровень ${current.level} — сигнала нет)`)
  }

  function check() {
    const { state, result } = cs.check(st, words)
    if (result === null) return
    if (result === 'wrong') {
      clearTimeout(flashT.current)
      setWrongFlash(true)
      flashT.current = setTimeout(() => setWrongFlash(false), WRONG_FLASH_MS)
      addLog(`Неверно: «${current.text}»`)
      return
    }
    setSt(state)
    if (catchSignal(current.level, helped) === 'heard') signal('heard', current)
    else addLog(`Верно: «${current.text}» (${helped ? 'с помощью' : `уровень ${current.level} — сигнала нет`})`)
    if (state.done) addLog('Все слова набраны — фраза открыта')
  }

  function reveal() {
    if (st.done) return
    setSt(cs.reveal)
    addLog('Раскрыть фразу — ненабранные не засчитаны')
  }

  return {
    words, levelOf, setLevel, current, helped, model, typed: st.typed, open: st.open, done: st.done,
    typedIndexes: st.typedIdx, remaining: cs.remainingOf(st, words), wrongFlash, log, memoryNote,
    pickWord, press, backspace, help, check, reveal, reset,
  }
}
