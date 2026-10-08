import { useMemo, useState } from 'react'
import { catchHeard, catchHelp } from '../../shared/api/catchApi.js'
import { catchWords, catchSignal } from '../feed/catch/feedCatch.js'
import { catchKeyboard } from '../feed/catch/catchLetters.js'
import { forcedKnowledge } from '../feed/catch/catchForce.js'
import * as cs from '../feed/catch/catchState.js'

const LOG_MAX = 40

// Состояние песочницы «Ловли» (спек v2): те же чистые переходы catchState.js, что и в useSlideCatch, но без ленты,
// лимитов, lock и аналитики. Уровни слов задаёт админ (по умолчанию все 0, первое слово — 2).
// writeMemory — слать ли реальные сигналы (catchHeard/catchHelp) в СВОЮ память; иначе только лог.
// savedLevels — сохранённые уровни слов ЭТОЙ фразы (catchAdminPrefs.js): подхватываются при смене фразы; onLevelsChange(moduleId,
// levels) — админ поменял уровень, вкладка сохраняет. «Сбросить» (reset) уровни не трогает — только ввод в песочнице.
// → тот же API, что у useSlideCatch (open, phase, cur, typedBy, model, results, openSheet/setCurrent/press/.../finish)
//   плюс hasPrev/prev, words, levelOf, setLevel, log, memoryNote, reset
export function useCatchSandbox({ title, moduleId, writeMemory, savedLevels = null, onLevelsChange }) {
  const baseWords = useMemo(() => catchWords(title, null), [title])
  const defaultIndex = baseWords[0]?.index ?? -1
  const [levels, setLevels] = useState(savedLevels ?? {}) // { index: 0..4 }, пусто — значения по умолчанию
  const [st, setSt] = useState(() => cs.initialCatch(moduleId))
  const [log, setLog] = useState([])
  const [memoryNote, setMemoryNote] = useState('')

  const knowledge = useMemo(() => forcedKnowledge(baseWords, levels, defaultIndex), [baseWords, levels, defaultIndex])
  const words = useMemo(() => catchWords(title, knowledge), [title, knowledge])

  const addLog = text => setLog(l => [text, ...l].slice(0, LOG_MAX))

  // Другая фраза — всё с нуля (сброс при рендере, как в useSlideCatch)
  const [seenKey, setSeenKey] = useState(`${moduleId}|${title}`)
  const key = `${moduleId}|${title}`
  if (seenKey !== key) {
    setSeenKey(key)
    setLevels(savedLevels ?? {})
    setSt(cs.initialCatch(moduleId))
    setLog([])
    setMemoryNote('')
  }

  const cur = st.cur == null ? null : cs.wordAt(words, st.cur)
  const helped = st.cur != null && st.helped.has(st.cur)
  const model = useMemo(() => (cur ? catchKeyboard(cur.text, cur.level) : null), [cur])
  const hasPrev = st.cur != null && words.length > 0 && words[0].index !== st.cur // активное слово не первое

  const levelOf = w => levels[w.index] ?? (w.index === defaultIndex ? 2 : 0)
  const setLevel = (index, level) => {
    const next = { ...levels, [index]: level }
    setLevels(next)
    onLevelsChange?.(moduleId, next)
  }

  const reset = () => {
    setSt(cs.initialCatch(moduleId))
    setLog([])
    setMemoryNote('')
  }

  // Сигнал в память: пишем только при включённом переключателе; результат — jsonb как текст
  function signal(kind, w) {
    const name = kind === 'help' ? 'Подсказать' : 'Услышано'
    if (!writeMemory) { addLog(`${name}: «${w.text}» (в память не пишем)`); return }
    const call = kind === 'help' ? catchHelp : catchHeard
    call(w.key, moduleId)
      .then(r => setMemoryNote(`${kind} «${w.key}» → ${JSON.stringify(r)}`))
      .catch(e => setMemoryNote(`${kind} «${w.key}» → ошибка: ${e?.message ?? e}`))
    addLog(`${name}: «${w.text}» → в память`)
  }

  const openSheet = () => { setSt(p => cs.openSheet(p, words)); addLog('Шторка открыта') }
  const setCurrent = index => {
    setSt(p => cs.setCurrent(p, words, index))
    const w = cs.wordAt(words, index)
    if (w) addLog(`Активное слово «${w.text}» (уровень ${w.level})`)
  }
  const press = ch => setSt(p => cs.press(p, words, ch))
  const backspace = () => setSt(cs.backspace)

  function check() {
    if (st.phase !== 'type' || st.done) return
    const { state, results } = cs.check(st, words)
    setSt(state)
    for (const r of results) {
      const w = cs.wordAt(words, r.index)
      if (!w) continue
      if (r.ok && catchSignal(w.level, st.helped.has(r.index)) === 'heard') signal('heard', w)
      else addLog(`${r.ok ? 'Верно' : r.typed ? 'Неверно' : 'Пропущено'}: «${w.text}»${r.ok ? ' (сигнала нет)' : ''}`)
    }
    addLog(`Проверить: ${cs.okCount(results)} из ${words.length}`)
  }

  function next() {
    if (!cur || st.phase !== 'type') return
    if (cs.isLast(st, words)) { check(); return }
    setSt(p => cs.next(p, words))
  }

  // «Предыдущее слово»: вернуться и поправить (набранное у обоих слов остаётся)
  function prev() {
    if (!cur || st.phase !== 'type' || !hasPrev) return
    setSt(p => cs.prev(p, words))
  }

  function help() {
    if (!cur || helped || st.phase !== 'type' || st.done) return
    setSt(cs.help)
    if (catchSignal(cur.level, true) === 'help') signal('help', cur)
    else addLog(`Подсказать: «${cur.text}» (уровень ${cur.level} — сигнала нет)`)
  }

  function reveal() {
    if (st.phase !== 'type' || st.done) return
    setSt(p => cs.reveal(p, words))
    addLog('Раскрыть — сигналов нет')
  }

  // «Спроси позже»: в песочнице то же, что в ленте, но без паузы (кулдаун для тестовых заданий не применяется) и без сигналов
  function later() {
    if (st.phase !== 'type' || st.done) return
    setSt(cs.later)
    addLog('Спроси позже — сигналов в память нет, пауза не ставится (тест)')
  }

  const finish = () => { setSt(cs.finish); addLog('Готово — фраза открыта') }

  return {
    words, levelOf, setLevel, open: st.open, phase: st.phase, done: st.done, revealed: st.revealed,
    cur, curIndex: st.cur, typedBy: st.typedBy, helped, shift: cs.shiftOn(st, words), model, results: st.results, isLast: cs.isLast(st, words), hasPrev,
    log, memoryNote, openSheet, setCurrent, press, backspace, next, prev, check, help, reveal, later, finish, reset,
  }
}
