import { useEffect, useMemo, useRef, useState } from 'react'
import { catchHeard, catchHelp } from '../../../shared/api/catchApi.js'
import { track } from '../../../shared/lib/analytics/track.js'
import { catchWords, catchEligible, catchOwnCount, catchSignal } from './feedCatch.js'
import { catchKeyboard } from './catchLetters.js'
import * as cs from './catchState.js'

const WRONG_FLASH_MS = 700 // красная тряска строки при неверном «Проверить»

// «Ловля слов» на одном слайде ленты (спек: «напечатай слова фразы, которые расслышал»).
// Решение «задание есть на этом слайде»: слова фразы с уровнями по памяти (catchWords), фраза подходит
// (catchEligible: задание включено у модуля, нет слова «Помнишь?», есть свои слова ≥2) и лента разрешила
// (feedCatch.claim — лимиты, один раз на модуль). Переходы состояния — catchState.js (чистые), здесь —
// их связка с React, сигналы в память (catchApi: напечатал сам → «услышано», «Помочь памяти» → «не расслышал»)
// и аналитика. Пока панель открыта — onLock(true): лента не свайпается. Память «Моего обучения»
// обновляется (onLearnChanged), когда задание закончено, если был сигнал.
// → { active, open, words, ownCount, current, typed, helped, model, typedIndexes, remaining, done, wrongFlash,
//     pickWord(index), press(ch), backspace(), help(), check() → 'correct'|'wrong'|null, reveal() }
export function useSlideCatch({ feedCatch, mod, active, knowledge, recallIndex, onLock, onLearnChanged }) {
  const words = useMemo(() => catchWords(mod.title, knowledge), [mod.title, knowledge])
  const eligible = catchEligible(words, { enabled: mod.feedCatchEnabled, recallIndex })
  const [offered, setOffered] = useState(null) // id фразы, на которой задание поставлено
  const claimed = offered === mod.id

  // Заявка уходит в таймер: setState прямо в теле эффекта запрещён, лишний кадр тут не заметен
  useEffect(() => {
    if (!active || !eligible || claimed || !feedCatch) return
    const t = setTimeout(() => { if (feedCatch.claim(mod.id)) setOffered(mod.id) }, 0)
    return () => clearTimeout(t)
  }, [active, eligible, claimed, mod.id, feedCatch])

  const [st, setSt] = useState(() => cs.initialCatch(mod.id))
  // Лента подменила фразу в этой копии слайда — состояние с нуля; слайд ушёл с экрана — панель закрыта
  // (сброс при рендере, не в эффекте — как в useTranslationReveal)
  if (st.modId !== mod.id) setSt(cs.initialCatch(mod.id))
  else if (!active && st.open) setSt(cs.closePanel(st))
  const s = st.modId !== mod.id ? cs.initialCatch(mod.id) : active ? st : cs.closePanel(st)
  const update = fn => setSt(p => (p.modId === mod.id ? fn(p) : p))

  // Блокировка свайпа — пока панель открыта на активном слайде
  const open = active && s.open
  const lockRef = useRef(onLock)
  useEffect(() => { lockRef.current = onLock })
  useEffect(() => { lockRef.current?.(open) }, [open])
  useEffect(() => () => lockRef.current?.(false), [])

  // Был сигнал в память — сообщаем ленте, когда задание закончено (или слайд размонтирован)
  const dirty = useRef(false)
  const changedRef = useRef(onLearnChanged)
  useEffect(() => { changedRef.current = onLearnChanged })
  useEffect(() => {
    if (s.done && dirty.current) { dirty.current = false; changedRef.current?.() }
  }, [s.done])
  useEffect(() => () => { if (dirty.current) changedRef.current?.() }, [])

  const [wrongFlash, setWrongFlash] = useState(false)
  const flashT = useRef(0)
  useEffect(() => () => clearTimeout(flashT.current), [])
  function flash() {
    clearTimeout(flashT.current)
    setWrongFlash(true)
    flashT.current = setTimeout(() => setWrongFlash(false), WRONG_FLASH_MS)
  }

  const current = s.current == null ? null : cs.wordAt(words, s.current)
  const helped = s.current != null && s.helped.has(s.current)
  const model = useMemo(() => (current ? catchKeyboard(current.text, current.level) : null), [current])
  const started = useRef(null) // id фразы, за которую уже ушло feed_catch_start

  function pickWord(index) {
    if (s.done || s.typedIdx.has(index)) return
    update(p => cs.pickWord(p, words, index))
    if (started.current !== mod.id) { started.current = mod.id; track('feed_catch_start', { module_id: mod.id }) }
  }

  function press(ch) {
    if (wrongFlash) setWrongFlash(false)
    update(p => cs.press(p, words, ch))
  }

  function backspace() {
    if (wrongFlash) setWrongFlash(false)
    update(cs.backspace)
  }

  // «Помочь памяти»: запутыватели гаснут; своё слово (≥2) — сигнал «не расслышал» сразу, не ждём набора
  function help() {
    if (!current || helped || s.done) return
    update(cs.help)
    if (catchSignal(current.level, true) === 'help') {
      dirty.current = true
      catchHelp(current.key, mod.id).catch(() => {})
    }
  }

  // «Проверить»: верно → маска слова спадает, сигнал «услышано» (своё слово без помощи); неверно — тряска
  function check() {
    const { state, result } = cs.check(s, words)
    if (result === null) return null
    track('feed_catch_word', { level: current.level, helped, ok: result === 'correct' })
    if (result === 'wrong') { flash(); return result }
    setSt(state)
    if (catchSignal(current.level, helped) === 'heard') {
      dirty.current = true
      catchHeard(current.key, mod.id).catch(() => {})
    }
    if (state.done) track('feed_catch_finish', { typed: state.typedIdx.size, total: words.length })
    return result
  }

  // «Раскрыть фразу»: всё открывается, ненабранные слова не засчитываются
  function reveal() {
    if (s.done) return
    update(cs.reveal)
    track('feed_catch_reveal', { typed: s.typedIdx.size, total: words.length })
  }

  return {
    active: claimed, open, words, ownCount: catchOwnCount(words), current, typed: s.typed, helped, model,
    typedIndexes: s.typedIdx, remaining: cs.remainingOf(s, words), done: s.done, wrongFlash,
    pickWord, press, backspace, help, check, reveal,
  }
}
