import { useState, useEffect, useRef } from 'react'
import PitAvatar from './PitAvatar.jsx'

export const REPLY_MS = 3000 // реплика Пита после ответа висит 3 с
const SWIPE_DY = 40          // смахивание вниз дальше 40 px = «закрыть»
const MAX_ANSWERS = 3

// Единый вид шторки вопросов Пита (PLAN_NEW_USER.md → A1): снизу, слева кружок Пита, текст ≤2 строк, до 3 ответов,
// крестик всегда, «Спроси позже» — только если кандидат просит (later: true). Виды (kind: question/hint/offer/reminder)
// отличаются лишь акцентом (класс promptSheet--<kind>, styles/prompt-sheet.css). Что показывать и когда — решает бюджет
// (shared/lib/prompts), здесь только вид. Без text рисовать нечего: «шторкой без разметки» живут кандидаты ленты
// («Ловля», «О чём диалог», подсказки) — они берут у бюджета разрешение, а показывают себя сами.
// Пропсы: prompt = { id, kind, text, answers: [{ id, label }], later?, reply?: { [answerId]: строка } } | null.
//   onAnswer(id) — зовётся СРАЗУ по тапу (ответ пишется в бюджет без задержки); onDismiss() — крестик/смахивание;
//   onLater() — «Спроси позже»; onReplyEnd() — реплика отыграла (необязательный).
// Реплика Пита (prompt.reply[id]) — только вид: компонент сам держит снимок шторки 3 с и показывает строку вместо кнопок,
// хотя слот бюджета уже свободен (prompt стал null). Крестик/смахивание во время реплики просто убирают её.
export default function PromptSheet({ prompt, onAnswer, onDismiss, onLater, onReplyEnd }) {
  const [reply, setReply] = useState(null) // { prompt, text } — снимок шторки с репликой
  const startY = useRef(null)
  const endRef = useRef(onReplyEnd)
  useEffect(() => { endRef.current = onReplyEnd })

  useEffect(() => {
    if (!reply) return undefined
    const t = setTimeout(() => { setReply(null); endRef.current?.() }, REPLY_MS)
    return () => clearTimeout(t)
  }, [reply])

  const view = reply ? reply.prompt : prompt
  if (!view?.text) return null
  const answers = (view.answers ?? []).slice(0, MAX_ANSWERS)

  const answer = id => {
    onAnswer?.(id)
    const text = view.reply?.[id]
    if (typeof text === 'string' && text) setReply({ prompt: view, text })
  }
  const close = () => (reply ? setReply(null) : onDismiss?.())
  const onTouchStart = e => { startY.current = e.touches?.[0]?.clientY ?? null }
  const onTouchEnd = e => {
    const y0 = startY.current
    startY.current = null
    const y1 = e.changedTouches?.[0]?.clientY
    if (y0 != null && y1 != null && y1 - y0 > SWIPE_DY) close()
  }

  return (
    <div key={view.id} className={`promptSheet promptSheet--${view.kind}`} role="dialog" aria-live="polite"
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <span className="promptSheetAvatar"><PitAvatar size={40} /></span>
      <div className="promptSheetBody">
        <p className="promptSheetText">{reply ? reply.text : view.text}</p>
        {!reply && (answers.length > 0 || view.later) && (
          <div className="promptSheetActions">
            {answers.map(a => (
              <button key={a.id} type="button" className="promptSheetBtn" onClick={() => answer(a.id)}>{a.label}</button>
            ))}
            {view.later && <button type="button" className="promptSheetLater" onClick={() => onLater?.()}>Спроси позже</button>}
          </div>
        )}
      </div>
      <button type="button" className="promptSheetClose" aria-label="Закрыть" onClick={close}>×</button>
    </div>
  )
}
