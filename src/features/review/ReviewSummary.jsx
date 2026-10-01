import { useEffect, useState } from 'react'
import { summaryLine } from './reviewTeacher.js'
import { requestOpenModule } from '../../shared/lib/openModuleEvent.js'
import ReviewWordBar from './ReviewWordBar.jsx'
import XpTransfer from '../../shared/ui/XpTransfer.jsx'
import Confetti from '../../shared/ui/Confetti.jsx'

// Итог сессии повторения — в стиле итога урока (LessonSummary): тёмная подложка с размытием,
// карточка, заголовок мелкими буквами, перенос награды в XP-полоску уровня, зелёная «Готово».
// Сверху конфетти — поздравление: повторение завершено. В карточке — строка учителя из
// данных и полоска каждого слова, которая на глазах пополняется (ReviewWordBar): слова идут
// по одному, медленно, чтобы рост можно было разглядеть. Ниже награда (XpTransfer, если XP
// начислен), день серии (memory_finish_session), мостик «Продолжить *фраза* · N%»
// в недопройденный модуль (reviewBridge.js). Слова, которые давались непросто,
// подаются с заботой — «вернёмся завтра», без «ошибок». Усвоенное слово,
// вспомненное на месячной проверке, уходит в постоянную память — празднуем
// фиолетовой строкой (settled — ответ memory_review_word). memory — память слов
// до сессии: оттуда прежний шаг для полоски; baseXp — XP до награды.
const TONE = { good: 'ok', hard: 'mid', again: 'soft', fail: 'soft' }
const FIRST_MS = 700   // первая полоска начинает расти, когда карточка уже проявилась
const STAGGER_MS = 1000 // следующая — через столько после предыдущей (не более MAX_STAGGER шагов)
const MAX_STAGGER = 5

function rewardText(finish) {
  if (!finish?.ok) return null
  const parts = []
  if (finish.xp > 0) parts.push(`+${finish.xp} XP`)
  else if (finish.xp_today >= finish.xp_cap) parts.push('XP за повторение на сегодня уже набран')
  if (finish.streak?.incremented) parts.push(`🔥 день серии засчитан (${finish.streak.streak})`)
  else if (finish.streak?.reason === 'already_today') parts.push('серия на сегодня уже засчитана')
  return parts.join(' · ') || null
}

export default function ReviewSummary({ results, finish, bridge, phrase = null, words, memory = [], baseXp = 0, onClose, onRequireAuth }) {
  const [visible, setVisible] = useState(false)
  const [xpDone, setXpDone] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const order = new Map(words.map((w, i) => [w, i]))
  const rows = [...results].sort((a, b) => (order.get(a.word) ?? 99) - (order.get(b.word) ?? 99))
  const before = new Map(memory.map(m => [m.word, m.step]))
  const earned = finish?.ok && finish.xp > 0 ? finish.xp : 0
  const reward = rewardText(finish)
  const settled = rows.filter(r => r.settled).map(r => `«${r.word}»`)
  // Ушедшие в постоянную память в строке учителя не повторяем — у них своя строка
  const lineRows = rows.filter(r => !r.settled)
  return (
    <>
      <Confetti count={140} />
      <div className={`lessonSummaryOverlay reviewSummary${visible ? ' lessonSummaryOverlayVisible' : ''}`} role="dialog" aria-label="Итог повторения">
        <div className="lessonSummaryCard reviewSumCard">
          <div className="summaryTitle reviewSummaryTitle">Повторение завершено</div>

          {rows.length > 0 && (
            <div className="reviewSumWords">
              {lineRows.length > 0 && <p className="reviewTeacherLine">{summaryLine(lineRows)}</p>}
              <ul className="reviewWords">
                {rows.map((r, i) => (
                  <li key={r.word} className={`reviewWord reviewWord--${TONE[r.outcome] ?? 'mid'}`}>
                    <ReviewWordBar word={r.word} from={before.get(r.word) ?? r.step} to={r.step} settled={r.settled}
                      delay={FIRST_MS + Math.min(i, MAX_STAGGER) * STAGGER_MS} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {phrase && (
            <p className={phrase.ok ? 'reviewPhraseResult reviewPhraseResultOk' : 'reviewPhraseResult'}>
              {phrase.ok ? `✨ Фраза «${phrase.title}» закреплена` : `Фраза «${phrase.title}» вернётся в другой раз`}
            </p>
          )}
          {settled.length > 0 && (
            <p className="reviewPhraseResult reviewSettled">
              ✨ {settled.join(', ')} {settled.length === 1 ? 'ушло' : 'ушли'} в постоянную память
            </p>
          )}

          {earned > 0 && <XpTransfer baseXp={baseXp} earnedXp={earned} label="Награда за повторение" onDone={() => setXpDone(true)} />}
          {reward && (xpDone || !earned) && <p className="reviewReward">{reward}</p>}

          {finish?.guest && (
            <div className="reviewGuest">
              <p className="reviewGuestLead">Войди — сохраним прогресс и напомним завтра</p>
              {onRequireAuth && <button className="lrBtn reviewBtnGuest" onClick={onRequireAuth}>Войти</button>}
            </div>
          )}
          <div className="reviewSumFoot">
            {bridge && (
              <button className="summaryCloseBtn reviewBridge" onClick={() => { onClose(); requestOpenModule(bridge) }}>
                Продолжить «{bridge.title}» · {bridge.pct}%
              </button>
            )}
            <button className="summaryCloseBtn" onClick={onClose}>Готово</button>
          </div>
        </div>
      </div>
    </>
  )
}
