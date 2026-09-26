import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { listWordMemory, reviewWord } from '../../shared/api/memoryApi.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../shared/lib/lessonsApi.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import { buildDecks } from '../review/reviewDecks.js'
import { buildSession, startSession, currentItem } from '../review/reviewSession.js'
import ReviewTurn from '../review/ReviewTurn.jsx'
import { feedOutcome } from './feedRemember.js'

// «Помнишь?» поверх ленты: одна карточка слова (ротация — не та, что в
// прошлый раз) тем же ReviewTurn, что и сессия повторения. Ответ — исход в
// память (source 'feed', засчитан в бюджет дня) и назад в ленту; закрыл или
// «Не могу слушать» — пролистал, без штрафа. Колоды кэшируются на 5 минут:
// «Помнишь?» бывает до 3 раз в день, колоды всех уроков не качаем каждый раз
const CACHE_MS = 5 * 60_000
let cache = null // { at, promise }
function loadData() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = {
      at: Date.now(),
      promise: Promise.all([loadCurricula(), listLessonCards(), getDefaultTeacher()])
        .then(([curricula, lessons, teacher]) => ({ decks: buildDecks(curricula, lessons), teacher }))
        .catch(e => { cache = null; throw e }),
    }
  }
  return cache.promise
}

export default function FeedRemember({ word, onDone, onClose }) {
  const [state, setState] = useState(null) // { session, decks, teacher }

  useEffect(() => {
    let alive = true
    Promise.all([loadData(), listWordMemory()])
      .then(([{ decks, teacher }, memory]) => {
        if (!alive) return
        const last = memory.find(m => m.word === word)?.last_card_id
        const built = buildSession([{ word, cards: 1 }], decks, { lastCardIds: { [word]: last } })
        if (!built.items.length) { onClose(); return }
        setState({ session: startSession(built), decks, teacher })
      })
      .catch(() => { if (alive) onClose() })
    return () => { alive = false }
  }, [word]) // eslint-disable-line react-hooks/exhaustive-deps -- слово — на всё время карточки

  function answer(res) {
    const card = currentItem(state.session).card
    reviewWord({
      word, outcome: feedOutcome(res, card.id), cardId: card.id, lessonId: card.lessonId, source: 'feed',
      events: [{ cardId: card.id, result: res.result, timeMs: res.timeMs ?? null }],
    }).finally(onDone)
  }

  const item = state && currentItem(state.session)
  return createPortal(
    <div className="reviewScreen feedRemember" role="dialog" aria-label="Помнишь?">
      <p className="feedRememberTitle">Помнишь?</p>
      {item
        ? <ReviewTurn
            session={state.session}
            item={item}
            phrase={state.decks.get(word)?.phrase ?? ''}
            teacher={resolveTeacher(item.card.teacher, state.teacher)}
            onAnswer={answer}
            onNoAudio={onClose}
            onClose={onClose}
          />
        : <p className="reviewNote">…</p>}
    </div>,
    document.body,
  )
}
