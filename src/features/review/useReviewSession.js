import { useState, useEffect, useRef } from 'react'
import { listWordMemory, reviewWord, finishReviewSession, getDailyMinutes, listRecentReviews } from '../../shared/api/memoryApi.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../shared/lib/lessonsApi.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { fetchMyDoneLessonIds } from '../../shared/api/starsApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { pickToday, dailyCardBudget, cardsShownToday, cardsForStep } from '../../shared/lib/memory/dailyPick.js'
import { buildDecks, localToday } from './reviewDecks.js'
import { pickBridge } from './reviewBridge.js'
import { createReviewTracker } from './reviewTracker.js'
import {
  buildSession, startSession, currentItem, isFinished, wordDone, answerCard, dropAudio, wordOutcomes, cardHasAudio,
} from './reviewSession.js'

// Сессия повторения дня целиком: загрузка памяти и колод, выбор дня
// (dailyPick.js), очередь карточек (reviewSession.js), отправка исхода слова
// на сервер СРАЗУ, как у слова кончились карточки (брошенная сессия не теряет
// отвеченное), в самом конце — memory_finish_session (XP + день серии) и
// мостик «Продолжить фразу» (reviewBridge.js). События аналитики —
// reviewTracker.js.
//
// Бюджет дня — на все сессии дня: уже показанные сегодня карточки вычитаются.
// focusWords — «Повторить сейчас» из карты памяти (Pro): только эти слова,
// вне расписания и бюджета (сервер ранний верный ответ шагом не засчитает).
//
// phase: loading | error | empty | intro | run | finishing | done
export function useReviewSession({ focusWords = null } = {}) {
  const [phase, setPhase] = useState('loading')
  const [session, setSession] = useState(null)
  // { decks, curricula, memory, teacher (общий, сырой), words, cards }
  const [info, setInfo] = useState(null)
  const [results, setResults] = useState([]) // [{ word, outcome, ok, applied, step }]
  const [finish, setFinish] = useState(null)
  const [bridge, setBridge] = useState(null)
  const [tracker] = useState(() => createReviewTracker())
  const sentRef = useRef(new Map()) // word → Promise строки results
  const noAudioRef = useRef(false)
  const finishingRef = useRef(false)

  useEffect(() => {
    let alive = true
    Promise.all([listWordMemory(), loadCurricula(), listLessonCards(), getDailyMinutes(), getDefaultTeacher(), listRecentReviews(1)])
      .then(([memory, curricula, lessons, minutes, teacher, reviews]) => {
        if (!alive) return
        const decks = buildDecks(curricula, lessons)
        const today = localToday()
        const canReview = w => (decks.get(w)?.cards.length ?? 0) > 0
        const picked = focusWords
          ? memory.filter(m => focusWords.includes(m.word) && canReview(m.word))
            .map(m => ({ word: m.word, step: m.step, cards: cardsForStep(m.step) }))
          : pickToday(memory, {
            today,
            budget: Math.max(0, dailyCardBudget(minutes) - cardsShownToday(reviews, today)),
            canReview,
          })
        const lastCardIds = Object.fromEntries(memory.map(m => [m.word, m.last_card_id]))
        const built = buildSession(picked, decks, { lastCardIds })
        setInfo({ decks, curricula, memory, teacher, words: built.words, cards: built.items.length })
        setSession(startSession(built))
        setPhase(built.items.length ? 'intro' : 'empty')
      })
      .catch(e => { console.error('[REVIEW] загрузка:', e?.message); if (alive) setPhase('error') })
    // Закрыли экран или приложение до итога — «брошена» (после итога трекер молчит)
    window.addEventListener('pagehide', tracker.abandon)
    return () => { alive = false; window.removeEventListener('pagehide', tracker.abandon); tracker.abandon() }
  }, [tracker]) // eslint-disable-line react-hooks/exhaustive-deps -- focusWords задаётся при открытии экрана

  async function finishAll() {
    if (finishingRef.current) return
    finishingRef.current = true
    setPhase('finishing')
    const rows = await Promise.all(sentRef.current.values())
    const words = rows.filter(r => r.ok).map(r => r.word)
    const res = words.length ? await finishReviewSession(words) : null
    const done = new Set([...getCompletedLessons(), ...await fetchMyDoneLessonIds()])
    tracker.finish({ words: words.length, xp: res?.xp })
    setFinish(res)
    setBridge(pickBridge(info.words, info.decks, info.curricula, done))
    refreshProfile() // XP и серия в шапке/профиле — фоном
    setPhase('done')
  }

  // Слова, у которых кончились карточки, — на сервер; сессия кончилась — итог
  function flush(s) {
    for (const o of wordOutcomes(s)) {
      if (!o.outcome || sentRef.current.has(o.word) || !wordDone(s, o.word)) continue
      const lessonId = info.decks.get(o.word)?.cards.find(c => c.id === o.cardId)?.lessonId ?? null
      const events = o.events.map(({ cardId, result, timeMs }) => ({ cardId, result, timeMs }))
      sentRef.current.set(o.word, reviewWord({ word: o.word, outcome: o.outcome, cardId: o.cardId, lessonId, events })
        .then(r => {
          const row = { word: o.word, outcome: o.outcome, ok: !!r?.ok, applied: r?.applied, step: r?.step ?? null }
          setResults(prev => [...prev, row])
          return row
        }))
    }
    if (isFinished(s)) finishAll()
  }

  // { result: 'correct' | 'wrong' | 'know', timeMs }
  function answer(res) {
    const item = currentItem(session)
    if (!item) return
    const deck = (info.decks.get(item.word)?.cards ?? []).filter(c => !(noAudioRef.current && cardHasAudio(c)))
    const next = answerCard(session, res, deck)
    tracker.answer({ word: item.word, result: res.result, attempt: item.attempt, timeMs: res.timeMs,
      answered: next.index, total: next.queue.length })
    setSession(next)
    flush(next)
  }

  // «Не могу слушать»: до конца сессии — без звука и голоса
  function skipAudio() {
    noAudioRef.current = true
    const next = dropAudio(session)
    setSession(next)
    flush(next)
  }

  function start() {
    tracker.start({ words: info.words.length, cards: info.cards })
    setPhase('run')
  }

  return { phase, session, info, results, finish, bridge, start, answer, skipAudio }
}
