import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { reviewWord } from '../../shared/api/memoryApi.js'
import { fireBurst } from '../../shared/lib/burstParticles.js'
import { tokenLevel } from './feedKnowledge.js'
import {
  pickRecallWord, quizOptions, recallOutcome, recallState, recallResult, recallColor, recallHoldMs,
} from './feedRecall.js'

// Сервер не ответил за это время — считаем результат сами и показываем его
const SERVER_WAIT_MS = 6000

// Повторение слова фразы на одном слайде ленты (feedRecall.js, макет frazy-pomnish.html):
//   «Тихо» — после открытия фразы слово со сроком «сегодня» мягко дышит (lureIndex), если лимиты
//   позволяют (useFeedRecall.claim); больше ничего в кадре. Срок мог настать и пока человек уже на
//   открытой фразе (память обновилась: возврат в приложение, «прожить день») — слово начинает
//   дышать в тот же момент, повторно открывать фразу не нужно;
//   тап по нему — та же линия и плашка, но сначала проверка «Закрепить знание» (onPick);
//   ответ (answer) — исход в память (source 'feed': бюджет дня, без XP и серии), результат на
//   плашке, салют на «верно и быстро», через ≈3 с плашка сама уходит (softClose);
//   дальше слово — обычное: повторный тап даёт обычный перевод.
// wp — useWordTranslate слайда; knowledge — { stepOf, settledOf }; onChanged — память изменилась
// (лента обновит данные «Моего обучения» — после ухода плашки, чтобы порядок ленты не прыгнул под ней).
// revealed — фраза открыта (шарики разлетелись).
// → { lureIndex, levelOf, tint, onPick, answer }
export function useSlideRecall({ recall, mod, active, revealed, knowledge, wp, onChanged }) {
  const { pick, pickWord, patch, softClose } = wp
  const cand = useMemo(
    () => pickRecallWord(mod.title, mod.wordTranslations, recall?.view),
    [mod.title, mod.wordTranslations, recall?.view],
  )
  const [offered, setOffered] = useState(null) // id фразы, на которой слово дышит
  const [local, setLocal] = useState(null)       // { modId, words: { слово: { step, perm } } } — ответы на этой фразе, пока память не обновилась
  const words = local?.modId === mod.id ? local.words : null
  const dirty = useRef(false)
  const changedRef = useRef(onChanged)
  useEffect(() => { changedRef.current = onChanged })

  // Фраза открыта, на экране, и в ней есть слово к повтору — если лимиты позволяют, оно начинает дышать.
  // Срабатывает и при открытии фразы, и когда слово «созрело» на уже открытой (cand появился позже).
  // Заявка уходит в таймер: setState прямо в теле эффекта запрещён, а лишний кадр здесь не заметен
  const hasCand = !!cand
  useEffect(() => {
    if (!active || !revealed || !hasCand || offered === mod.id) return
    const t = setTimeout(() => { if (recall.claim(mod.id)) setOffered(mod.id) }, 0)
    return () => clearTimeout(t)
  }, [active, revealed, hasCand, offered, mod.id, recall])

  // Память обновляем, когда плашка ушла (или слайд размонтирован)
  useEffect(() => {
    if (!pick && dirty.current) { dirty.current = false; changedRef.current?.() }
  }, [pick])
  useEffect(() => () => { if (dirty.current) changedRef.current?.() }, [])

  const lureIndex = active && offered === mod.id && cand && !words?.[cand.key] ? cand.index : -1

  const { stepOf, settledOf } = knowledge ?? {}
  const merged = useMemo(() => {
    if (!words) return { stepOf, settledOf }
    const steps = new Map(stepOf ?? [])
    const settled = new Set(settledOf ?? [])
    for (const [k, v] of Object.entries(words)) {
      steps.set(k, v.step)
      if (v.perm) settled.add(k); else settled.delete(k)
    }
    return { stepOf: steps, settledOf: settled }
  }, [stepOf, settledOf, words])
  const levelOf = useCallback(text => tokenLevel(text, merged.stepOf, merged.settledOf), [merged])

  function onPick(index, tr, el, isLure) {
    const options = isLure && cand && index === cand.index ? quizOptions(cand.tr, recall.pool) : null
    if (!options) { pickWord(index, tr, el); return }
    pickWord(index, tr, el, {
      recall: {
        key: cand.key, step: cand.step, wasSettled: !!settledOf?.has(cand.key),
        options, correct: cand.tr, shownAt: Date.now(), phase: 'quiz',
      },
    })
  }

  function answer(option) {
    const r = pick?.recall
    if (!r || r.phase !== 'quiz') return
    const id = pick.id
    const right = option === r.correct
    const timeMs = Date.now() - r.shownAt
    const outcome = recallOutcome(right, timeMs)
    const phase = recallState(outcome)
    patch(id, p => ({ recall: { ...p.recall, phase } }))
    if (phase === 'ok') fireBurst({ count: 30, size: 4 })

    const asked = reviewWord({
      word: r.key, outcome, source: 'feed',
      events: [{ cardId: null, result: right ? 'correct' : 'wrong', timeMs }],
    }).catch(() => null)
    const wait = new Promise(res => setTimeout(() => res(null), SERVER_WAIT_MS))
    Promise.race([asked, wait]).then(res => {
      const result = recallResult({ outcome, step: r.step, wasSettled: r.wasSettled, res })
      const final = { ...r, phase, ...result, go: true }
      patch(id, () => ({ recall: final }))
      setLocal(l => ({ modId: mod.id, words: { ...(l?.modId === mod.id ? l.words : null), [r.key]: { step: result.to, perm: result.perm } } }))
      dirty.current = true
      setTimeout(() => softClose(id), recallHoldMs(final))
    })
  }

  return { lureIndex, levelOf, tint: recallColor(pick?.recall), onPick, answer }
}
