import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReviewSession } from './useReviewSession.js'
import { currentItem } from './reviewSession.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import ReviewTurn from './ReviewTurn.jsx'
import ReviewWarmup from './ReviewWarmup.jsx'
import ReviewSummary from './ReviewSummary.jsx'
import ReviewLoading from './ReviewLoading.jsx'
import { phraseItem } from './phraseDrill.js'
import { levelOf } from '../learn/memoryLadder.js'

// Экран повторения дня (этап 4 системы повторения, PROJECT.md → «Формат
// повторения»): «Ищу слова…» → сразу карточки (вступления с «Начать» нет — тап
// «Повторить» уже и есть начало) → итог. Полноэкранный слой в body
// (портал): открывается из любого места, не завися от transform/overflow
// родителя. Входы: «Моё обучение» (день или «Повторить сейчас» —
// focusWords) и админка → «Повторение».
// Медиа греется заранее (ReviewWarmup): первая карточка — пока на экране «Ищу
// слова…» (не дольше WARM_MAX_MS), следующая — пока отвечают на текущую;
// скачанное передаётся плееру карточки.
function Message({ title, text, onClose }) {
  return (
    <div className="reviewMessage">
      {title && <h2 className="reviewMessageTitle">{title}</h2>}
      <p className="reviewMessageText">{text}</p>
      <button className="reviewBtn reviewBtn--main" onClick={onClose}>Закрыть</button>
    </div>
  )
}

// Перед каждым заданием — «Пит печатает» (точки): минимум TYPING_MS, чтобы это читалось как
// переписка. Первой карточке точки держатся, пока греется её медиа, но не дольше WARM_MAX_MS
const TYPING_MS = 800
const WARM_MAX_MS = 1500

export default function ReviewScreen({ focusWords = null, phrase = null, onClose, onRequireAuth = null }) {
  const r = useReviewSession({ focusWords, phrase })
  const warmRef = useRef(null)
  const [handoff, setHandoff] = useState(null) // { key, blobMap } — прогретое для карточки
  const [firstReady, setFirstReady] = useState(false) // первая карточка прогрета (или ждать нечего / вышло время)
  const s = r.session
  const item = s && currentItem(s)
  const first = s?.queue[0]
  // Первую карточку с файлами держим на точках «печатает», пока она не прогреется
  const holdFirst = r.phase === 'run' && !firstReady && !!first?.card.files?.length
  const warmItem = r.phase === 'run' ? (holdFirst ? first : s?.queue[s.index + 1]) : null

  // Забрать прогретое для карточки, что встанет следующей
  function takeWarm(nextItem) {
    const blobMap = nextItem && warmRef.current?.take()
    setHandoff(blobMap ? { key: nextItem.key, blobMap } : null)
  }

  // Первая карточка прогрета (или вышло время) — точки уходят, задание появляется, скачанное отдаём плееру
  const releaseRef = useRef(null)
  useEffect(() => {
    releaseRef.current = () => { if (!holdFirst) return; takeWarm(first); setFirstReady(true) }
  })
  useEffect(() => {
    if (!holdFirst) return undefined
    const t = setTimeout(() => releaseRef.current?.(), WARM_MAX_MS)
    return () => clearTimeout(t)
  }, [holdFirst])

  function answer(res) {
    takeWarm(s.queue[s.index + 1])
    r.answer(res)
  }

  let body = null
  if (r.phase === 'loading') body = <ReviewLoading text="Ищу слова, которые нужно напомнить…" />
  else if (r.phase === 'finishing') body = <ReviewLoading text="Подвожу итог…" />
  else if (r.phase === 'error') body = <Message text="Не загрузилось. Проверь сеть." onClose={onClose} />
  else if (r.phase === 'empty') body = <Message title="Повторение на сегодня закончено ✓" text="Слова уже укладываются в памяти — можно отдохнуть. Новые придут, когда настанет их срок." onClose={onClose} />
  else if (r.phase === 'run' && item) {
    body = (
      <ReviewTurn
        key={`${item.key}@${s.index}`}
        session={s}
        item={item}
        phrase={r.info.decks.get(item.word)?.phrase ?? ''}
        teacher={resolveTeacher(item.card.teacher, r.info.teacher)}
        initialBlobMap={handoff?.key === item.key ? handoff.blobMap : null}
        typingMs={TYPING_MS}
        hold={holdFirst}
        onAnswer={answer}
        onNoAudio={r.skipAudio}
        onClose={onClose}
      />
    )
  } else if (r.phase === 'phrase') {
    const item = phraseItem(phrase)
    body = (
      <ReviewTurn
        key={item.key}
        session={{ queue: [item], index: 0, events: [] }}
        item={item}
        phrase=""
        title="Закрепление фразы"
        teacher={r.info.teacher}
        typingMs={TYPING_MS}
        onAnswer={r.answerPhrase}
        onNoAudio={() => r.answerPhrase({ result: 'skip' })}
        onClose={onClose}
      />
    )
  } else if (r.phase === 'done') {
    body = <ReviewSummary results={r.results} finish={r.finish} baseXp={r.baseXp} bridge={r.bridge} phrase={r.phraseRes} words={r.info.words} memory={r.info.memory} onClose={onClose} onRequireAuth={onRequireAuth} />
  }

  // Оттенок фона, точки закрытого слова и «худ» чата карточки (кнопка ▶ и спектр голосовых) — цвета
  // ступени памяти слова: новое — небесный, знакомое — жёлтый, усвоенное — салатовый (memory-ladder.css)
  const step = r.phase === 'run' && item ? r.info?.memory.find(m => m.word === item.word)?.step : null
  const level = levelOf(step ?? 5)

  return createPortal(
    <div className={`reviewScreen reviewScreen--lvl${level}`} role="dialog" aria-label="Повторение">
      {body}
      {warmItem && (
        <ReviewWarmup key={warmItem.key} card={warmItem.card} ref={warmRef}
          onWarm={holdFirst ? warm => { if (warm) releaseRef.current?.() } : null} />
      )}
    </div>,
    document.body,
  )
}
