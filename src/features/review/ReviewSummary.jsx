import { summaryLine } from './reviewTeacher.js'
import { requestOpenModule } from '../../shared/lib/openModuleEvent.js'
import ReviewWordBar from './ReviewWordBar.jsx'

// Итог сессии повторения — в стиле вкладки «Моя память»: заголовок слева, карточка
// с фоном-узором, кнопки как там (.lrBtn). В карточке — строка учителя из
// данных и полоска каждого слова, которая на глазах пополняется (ReviewWordBar);
// ниже XP и день серии (memory_finish_session), мостик «Продолжить *фраза* · N%»
// в недопройденный модуль (reviewBridge.js). Слова, которые давались непросто,
// подаются с заботой — «вернёмся завтра», без «ошибок». Усвоенное слово,
// вспомненное на месячной проверке, уходит в постоянную память — празднуем
// фиолетовой строкой (settled — ответ memory_review_word). memory — память слов
// до сессии: оттуда прежний шаг для полоски.
const TONE = { good: 'ok', know: 'ok', hard: 'mid', again: 'soft', fail: 'soft' }

function rewardText(finish) {
  if (!finish?.ok) return null
  const parts = []
  if (finish.xp > 0) parts.push(`+${finish.xp} XP`)
  else if (finish.xp_today >= finish.xp_cap) parts.push('XP за повторение на сегодня уже набран')
  if (finish.streak?.incremented) parts.push(`🔥 день серии засчитан (${finish.streak.streak})`)
  else if (finish.streak?.reason === 'already_today') parts.push('серия на сегодня уже засчитана')
  return parts.join(' · ') || null
}

export default function ReviewSummary({ results, finish, bridge, phrase = null, words, memory = [], onClose, onRequireAuth }) {
  const order = new Map(words.map((w, i) => [w, i]))
  const rows = [...results].sort((a, b) => (order.get(a.word) ?? 99) - (order.get(b.word) ?? 99))
  const before = new Map(memory.map(m => [m.word, m.step]))
  const reward = rewardText(finish)
  const settled = rows.filter(r => r.settled).map(r => `«${r.word}»`)
  // Ушедшие в постоянную память в строке учителя не повторяем — у них своя строка
  const lineRows = rows.filter(r => !r.settled)
  return (
    <div className="reviewSummary">
      <h2 className="lrTitle reviewSummaryTitle">Повторение завершено</h2>
      {rows.length > 0 && (
        <div className="reviewSumCard">
          {lineRows.length > 0 && <p className="reviewTeacherLine">{summaryLine(lineRows)}</p>}
          <ul className="reviewWords">
            {rows.map(r => (
              <li key={r.word} className={`reviewWord reviewWord--${TONE[r.outcome] ?? 'mid'}`}>
                <ReviewWordBar word={r.word} from={before.get(r.word) ?? r.step} to={r.step} settled={r.settled} />
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
      {reward && <p className="reviewReward">{reward}</p>}
      {finish?.guest && (
        <div className="reviewGuest">
          <p className="reviewGuestLead">Войди — сохраним прогресс и напомним завтра</p>
          {onRequireAuth && <button className="lrBtn reviewBtnGuest" onClick={onRequireAuth}>Войти</button>}
        </div>
      )}
      <div className="reviewSumFoot">
        {bridge && (
          <button className="lrBtn reviewBridge" onClick={() => { onClose(); requestOpenModule(bridge) }}>
            Продолжить «{bridge.title}» · {bridge.pct}%
          </button>
        )}
        <button className="lrBtn lrBtnMain" onClick={onClose}>Готово</button>
      </div>
    </div>
  )
}
