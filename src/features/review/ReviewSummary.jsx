import { summaryLine } from './reviewTeacher.js'

// Итог сессии повторения: строка учителя из данных, сила каждого слова
// (шаг памяти 1–5 после ответа сервера), XP и день серии — по ответу
// memory_finish_session.
const TONE = { good: 'ok', know: 'ok', hard: 'mid', again: 'bad', fail: 'bad' }

function StrengthDots({ step }) {
  if (!step) return null
  return (
    <span className="reviewDots" aria-label={`Сила памяти ${step} из 5`}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= step ? 'reviewDot reviewDot--on' : 'reviewDot'} />)}
    </span>
  )
}

function rewardText(finish) {
  if (!finish?.ok) return null
  const parts = []
  if (finish.xp > 0) parts.push(`+${finish.xp} XP`)
  else if (finish.xp_today >= finish.xp_cap) parts.push('XP за повторение на сегодня уже набран')
  if (finish.streak?.incremented) parts.push(`🔥 день серии засчитан (${finish.streak.streak})`)
  else if (finish.streak?.reason === 'already_today') parts.push('серия на сегодня уже засчитана')
  return parts.join(' · ') || null
}

export default function ReviewSummary({ results, finish, words, onClose }) {
  const order = new Map(words.map((w, i) => [w, i]))
  const rows = [...results].sort((a, b) => (order.get(a.word) ?? 99) - (order.get(b.word) ?? 99))
  const reward = rewardText(finish)
  return (
    <div className="reviewSummary">
      <h2 className="reviewSummaryTitle">Повторение завершено</h2>
      <p className="reviewTeacherLine">{summaryLine(rows)}</p>
      <ul className="reviewWords">
        {rows.map(r => (
          <li key={r.word} className={`reviewWord reviewWord--${TONE[r.outcome] ?? 'mid'}`}>
            <span className="reviewWordText">{r.word}</span>
            <StrengthDots step={r.step} />
          </li>
        ))}
      </ul>
      {reward && <p className="reviewReward">{reward}</p>}
      <button className="reviewBtn reviewBtn--main" onClick={onClose}>Готово</button>
    </div>
  )
}
