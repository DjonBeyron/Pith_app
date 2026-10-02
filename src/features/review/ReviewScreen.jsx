import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReviewSession } from './useReviewSession.js'
import { currentItem, endsQueue } from './reviewSession.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import ReviewTurn from './ReviewTurn.jsx'
import ReviewWarmup from './ReviewWarmup.jsx'
import ReviewSummary from './ReviewSummary.jsx'
import ReviewLoading from './ReviewLoading.jsx'
import { phraseItem } from './phraseDrill.js'
import { levelOf } from '../learn/memoryLadder.js'
import { levelClass } from './reviewLevel.js'

// Экран повторения дня (этап 4 системы повторения, PROJECT.md → «Формат
// повторения»): «Ищу слова…» → сразу карточки (вступления с «Начать» нет — тап
// «Повторить» уже и есть начало) → итог. Полноэкранный слой в body
// (портал): открывается из любого места, не завися от transform/overflow
// родителя. Входы: «Моё обучение» (день или «Повторить сейчас» —
// focusWords) и админка → «Повторение».
// Медиа греется заранее (ReviewWarmup): первая карточка — пока на экране «Ищу
// слова…» (не дольше WARM_MAX_MS), следующая — пока отвечают на текущую;
// скачанное передаётся плееру карточки.
// Последняя карточка не смахивается: после ответа экран сам затемняется (.reviewScrim) и поверх еле
// видной карточки проявляется итог. Закрытие (стрелка, «Готово») — плавное растворение экрана:
// под ним проявляется «Моя память».
// start — { word, level } с вкладки «Память»: слово, с которого начать, и его ступень (цвет фона
// уже на экране загрузки). onFinished — итог готов: вкладка за экраном обновляется заранее, а не
// скачком после растворения.
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
const LEAVE_MS = 500 // растворение экрана при закрытии (review-finish.css)

export default function ReviewScreen({ focusWords = null, phrase: phraseProp = null, start = null, onClose, onFinished = null, onRequireAuth = null }) {
  const [phrase] = useState(phraseProp) // фраза — на момент открытия: вкладка за экраном после итога перезагружается
  const r = useReviewSession({ focusWords, phrase, firstWord: start?.word ?? null })
  const warmRef = useRef(null)
  const [handoff, setHandoff] = useState(null) // { key, blobMap } — прогретое для карточки
  const [firstReady, setFirstReady] = useState(false) // первая карточка прогрета (или ждать нечего / вышло время)
  const [finalTurn, setFinalTurn] = useState(null) // последняя карточка ответена: { item, index } | { phrase: true } — остаётся под затемнением
  const [leaving, setLeaving] = useState(false)
  const leaveRef = useRef(0)
  const s = r.session
  const item = s && currentItem(s)
  const first = s?.queue[0]
  // Первую карточку с файлами держим на точках «печатает», пока она не прогреется
  const holdFirst = r.phase === 'run' && !firstReady && !!first?.card.files?.length
  const warmItem = r.phase === 'run' ? (holdFirst ? first : s?.queue[s.index + 1]) : null

  // Забрать прогретое для карточки, что встанет следующей (после последней — ничего, под затемнением
  // остаётся та же карточка с теми же файлами)
  function takeWarm(nextItem) {
    if (!nextItem) return
    const blobMap = warmRef.current?.take()
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

  // Итог готов — вкладка за экраном обновляется сейчас, пока экран закрыт ею же от глаз
  useEffect(() => { if (r.phase === 'done') onFinished?.() }, [r.phase, onFinished])
  useEffect(() => () => clearTimeout(leaveRef.current), [])

  function answer(res) {
    // Ответ на последнюю карточку (и фразы дальше нет): она остаётся на экране под затемнением
    if (!phrase && endsQueue(s, item, res.result)) setFinalTurn({ item, index: s.index })
    takeWarm(s.queue[s.index + 1])
    r.answer(res)
  }
  function answerPhrase(res) {
    setFinalTurn({ phrase: true })
    r.answerPhrase(res)
  }

  // Закрыть плавно: экран растворяется, и только потом его убирают
  function close() {
    if (leaveRef.current) return
    setLeaving(true)
    leaveRef.current = setTimeout(onClose, LEAVE_MS)
  }

  const runTurn = (it, index) => (
    <ReviewTurn
      key={`${it.key}@${index}`}
      session={s}
      item={it}
      phrase={r.info.decks.get(it.word)?.phrase ?? ''}
      teacher={resolveTeacher(it.card.teacher, r.info.teacher)}
      initialBlobMap={handoff?.key === it.key ? handoff.blobMap : null}
      typingMs={TYPING_MS}
      hold={holdFirst}
      muted={r.muted}
      finalRun={!phrase}
      onAnswer={answer}
      onNoAudio={r.skipAudio}
      onClose={close}
    />
  )
  const phraseTurn = () => {
    const it = phraseItem(phrase)
    return (
      <ReviewTurn
        key={it.key}
        session={{ queue: [it], index: 0, events: [] }}
        item={it}
        phrase=""
        title="Закрепление фразы"
        teacher={r.info.teacher}
        typingMs={TYPING_MS}
        muted={r.muted}
        finalRun
        onAnswer={answerPhrase}
        onNoAudio={() => answerPhrase({ result: 'skip' })}
        onClose={close}
      />
    )
  }

  const ended = r.phase === 'finishing' || r.phase === 'done'
  let body = null
  if (r.phase === 'loading') body = <ReviewLoading text="Ищу слова, которые нужно напомнить…" />
  else if (r.phase === 'error') body = <Message text="Не загрузилось. Проверь сеть." onClose={close} />
  else if (r.phase === 'empty') body = <Message title="Повторение на сегодня закончено ✓" text="Слова укладываются в памяти — можно отдохнуть." onClose={close} />
  else if (r.phase === 'run' && item) body = runTurn(item, s.index)
  else if (r.phase === 'phrase' || (ended && finalTurn?.phrase)) body = phraseTurn()
  else if (ended && finalTurn?.item) body = runTurn(finalTurn.item, finalTurn.index)
  else if (r.phase === 'finishing') body = <ReviewLoading text="Подвожу итог…" />

  // Ступень памяти слова на карточке красит фон, точки закрытого слова и «худ» чата (memory-ladder.css):
  // новое — небесный, знакомое — жёлтый, усвоенное — салатовый. Пока нет карточки (загрузка) — ступень
  // со вкладки «Память» (start), а после последней — та, что была
  const step = r.phase === 'run' && item ? r.info?.memory.find(m => m.word === item.word)?.step : null
  const nowLevel = r.phase === 'run' && item ? levelOf(step ?? 5) : r.phase === 'phrase' ? 3 : null
  const [lastLevel, setLastLevel] = useState(start?.level ?? null)
  if (nowLevel !== null && nowLevel !== lastLevel) setLastLevel(nowLevel)
  const level = nowLevel ?? lastLevel

  return createPortal(
    <div className={`reviewScreen${levelClass(level)}${leaving ? ' reviewScreen--leaving' : ''}`} role="dialog" aria-label="Повторение">
      {body}
      {finalTurn && (
        <div className="reviewScrim" aria-hidden="true">
          {r.phase === 'finishing' && <p className="reviewScrimText">Подвожу итог…</p>}
        </div>
      )}
      {r.phase === 'done' && (
        <ReviewSummary results={r.results} finish={r.finish} baseXp={r.baseXp} bridge={r.bridge} phrase={r.phraseRes} words={r.info.words} memory={r.info.memory} onClose={close} onRequireAuth={onRequireAuth} />
      )}
      {warmItem && (
        <ReviewWarmup key={warmItem.key} card={warmItem.card} ref={warmRef}
          onWarm={holdFirst ? warm => { if (warm) releaseRef.current?.() } : null} />
      )}
    </div>,
    document.body,
  )
}
