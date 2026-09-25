import { useState, useEffect, useRef } from 'react'
import { listWordMemory, reviewWord, finishReviewSession, getDailyMinutes } from '../../shared/api/memoryApi.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../shared/lib/lessonsApi.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { pickToday, dailyCardBudget } from '../../shared/lib/memory/dailyPick.js'
import { buildDecks, localToday } from './reviewDecks.js'
import {
  buildSession, startSession, currentItem, isFinished, wordDone, answerCard, dropAudio, wordOutcomes, cardHasAudio,
} from './reviewSession.js'

// Сессия повторения дня целиком: загрузка памяти и колод, выбор дня
// (dailyPick.js), очередь карточек (reviewSession.js), отправка исхода слова
// на сервер СРАЗУ, как у слова кончились карточки (брошенная сессия не теряет
// отвеченное), и в самом конце — memory_finish_session (XP + день серии).
//
// phase: loading | error | empty | intro | run | finishing | done
export function useReviewSession() {
  const [phase, setPhase] = useState('loading')
  const [session, setSession] = useState(null)
  const [info, setInfo] = useState(null) // { decks, memory, teacher, words, cards }
  const [results, setResults] = useState([]) // [{ word, outcome, ok, applied, step }]
  const [finish, setFinish] = useState(null)
  const sentRef = useRef(new Map()) // word → Promise строки results
  const noAudioRef = useRef(false)
  const finishingRef = useRef(false)

  useEffect(() => {
    let alive = true
    Promise.all([listWordMemory(), loadCurricula(), listLessonCards(), getDailyMinutes(), getDefaultTeacher()])
      .then(([memory, curricula, lessons, minutes, teacher]) => {
        if (!alive) return
        const decks = buildDecks(curricula, lessons)
        const picked = pickToday(memory, {
          today: localToday(),
          budget: dailyCardBudget(minutes),
          canReview: w => (decks.get(w)?.cards.length ?? 0) > 0,
        })
        const lastCardIds = Object.fromEntries(memory.map(m => [m.word, m.last_card_id]))
        const built = buildSession(picked, decks, { lastCardIds })
        setInfo({ decks, memory, teacher: resolveTeacher(null, teacher), words: built.words, cards: built.items.length })
        setSession(startSession(built))
        setPhase(built.items.length ? 'intro' : 'empty')
      })
      .catch(e => { console.error('[REVIEW] загрузка:', e?.message); if (alive) setPhase('error') })
    return () => { alive = false }
  }, [])

  async function finishAll() {
    if (finishingRef.current) return
    finishingRef.current = true
    setPhase('finishing')
    const rows = await Promise.all(sentRef.current.values())
    const words = rows.filter(r => r.ok).map(r => r.word)
    setFinish(words.length ? await finishReviewSession(words) : null)
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

  return {
    phase, session, info, results, finish,
    start: () => setPhase('run'),
    answer, skipAudio,
  }
}
