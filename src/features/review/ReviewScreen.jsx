import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReviewSession } from './useReviewSession.js'
import { currentItem } from './reviewSession.js'
import { introLine } from './reviewTeacher.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'
import ReviewTurn from './ReviewTurn.jsx'
import ReviewWarmup from './ReviewWarmup.jsx'
import ReviewSummary from './ReviewSummary.jsx'

// Экран повторения дня (этап 4 системы повторения, PROJECT.md → «Формат
// повторения»): строка учителя → карточки → итог. Полноэкранный слой в body
// (портал): открывается из любого места, не завися от transform/overflow
// родителя. Пока вход один — админка → «Повторение».
// Следующая карточка греется заранее (ReviewWarmup): на вступлении — первая,
// во время ответа — следующая; скачанное передаётся плееру карточки.
function Message({ title, text, onClose }) {
  return (
    <div className="reviewCenter">
      {title && <h2 className="reviewSummaryTitle">{title}</h2>}
      <p className="reviewTeacherLine">{text}</p>
      <button className="reviewBtn reviewBtn--main" onClick={onClose}>Закрыть</button>
    </div>
  )
}

export default function ReviewScreen({ onClose }) {
  const r = useReviewSession()
  const warmRef = useRef(null)
  const [handoff, setHandoff] = useState(null) // { key, blobMap } — прогретое для карточки
  const s = r.session
  const item = s && currentItem(s)
  const warmItem = r.phase === 'intro' ? s?.queue[0] : r.phase === 'run' ? s?.queue[s.index + 1] : null

  // Забрать прогретое для карточки, что встанет следующей
  function takeWarm(nextItem) {
    const blobMap = nextItem && warmRef.current?.take()
    setHandoff(blobMap ? { key: nextItem.key, blobMap } : null)
  }

  function start() {
    // В жесте нажатия, как у «Начать урок»: iOS разрешает звук только так
    preloadSounds()
    unlockAudio()
    primeAudio()
    takeWarm(s.queue[0])
    r.start()
  }

  function answer(res) {
    takeWarm(s.queue[s.index + 1])
    r.answer(res)
  }

  let body = null
  if (r.phase === 'loading') body = <p className="reviewNote">Собираю карточки…</p>
  else if (r.phase === 'finishing') body = <p className="reviewNote">Подвожу итог…</p>
  else if (r.phase === 'error') body = <Message text="Не загрузилось. Проверь сеть и попробуй ещё раз." onClose={onClose} />
  else if (r.phase === 'empty') body = <Message title="На сегодня всё ✓" text="Слова для повторения появятся, когда подойдёт их срок." onClose={onClose} />
  else if (r.phase === 'intro') {
    body = (
      <div className="reviewCenter">
        <p className="reviewTeacherName">{r.info.teacher?.name || 'Учитель'}</p>
        <p className="reviewTeacherLine">{introLine({ words: r.info.words, cards: r.info.cards, memory: r.info.memory })}</p>
        <button className="reviewBtn reviewBtn--main" onClick={start}>Начать</button>
      </div>
    )
  } else if (r.phase === 'run' && item) {
    body = (
      <ReviewTurn
        key={`${item.key}@${s.index}`}
        session={s}
        item={item}
        phrase={r.info.decks.get(item.word)?.phrase ?? ''}
        teacher={resolveTeacher(item.card.teacher, r.info.teacher)}
        initialBlobMap={handoff?.key === item.key ? handoff.blobMap : null}
        onAnswer={answer}
        onNoAudio={r.skipAudio}
        onClose={onClose}
      />
    )
  } else if (r.phase === 'done') {
    body = <ReviewSummary results={r.results} finish={r.finish} bridge={r.bridge} words={r.info.words} onClose={onClose} />
  }

  return createPortal(
    <div className="reviewScreen" role="dialog" aria-label="Повторение">
      {body}
      {warmItem && <ReviewWarmup key={warmItem.key} card={warmItem.card} ref={warmRef} />}
    </div>,
    document.body,
  )
}
