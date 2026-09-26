import { summaryLine } from './reviewTeacher.js'
import { requestOpenModule } from '../../shared/lib/openModuleEvent.js'
import StrengthDots from '../../shared/ui/StrengthDots.jsx'

// Итог сессии повторения: строка учителя из данных, сила каждого слова
// (шаг памяти 1–5 после ответа сервера), XP и день серии — по ответу
// memory_finish_session; мостик «Продолжить *фраза* · N%» — в недопройденный
// модуль слов сессии (reviewBridge.js), открывает его схему во вкладке «Уроки».
// Родное слово, вспомненное на месячной проверке, уходит в постоянную память —
// празднуем отдельной фиолетовой строкой (settled — ответ memory_review_word).
const TONE = { good: 'ok', know: 'ok', hard: 'mid', again: 'bad', fail: 'bad' }

function rewardText(finish) {
  if (!finish?.ok) return null
  const parts = []
  if (finish.xp > 0) parts.push(`+${finish.xp} XP`)
  else if (finish.xp_today >= finish.xp_cap) parts.push('XP за повторение на сегодня уже набран')
  if (finish.streak?.incremented) parts.push(`🔥 день серии засчитан (${finish.streak.streak})`)
  else if (finish.streak?.reason === 'already_today') parts.push('серия на сегодня уже засчитана')
  return parts.join(' · ') || null
}

export default function ReviewSummary({ results, finish, bridge, phrase = null, words, onClose, onRequireAuth }) {
  const order = new Map(words.map((w, i) => [w, i]))
  const rows = [...results].sort((a, b) => (order.get(a.word) ?? 99) - (order.get(b.word) ?? 99))
  const reward = rewardText(finish)
  const settled = rows.filter(r => r.settled).map(r => `«${r.word}»`)
  return (
    <div className="reviewSummary">
      <h2 className="reviewSummaryTitle">Повторение завершено</h2>
      {rows.length > 0 && <p className="reviewTeacherLine">{summaryLine(rows)}</p>}
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
      <ul className="reviewWords">
        {rows.map(r => (
          <li key={r.word} className={`reviewWord reviewWord--${TONE[r.outcome] ?? 'mid'}`}>
            <span className="reviewWordText">{r.word}</span>
            <StrengthDots step={r.step} />
          </li>
        ))}
      </ul>
      {reward && <p className="reviewReward">{reward}</p>}
      {finish?.guest && (
        <>
          <p className="reviewTeacherLine reviewGuestLead">Сохрани прогресс — войди, и завтра напомним повторить</p>
          {onRequireAuth && <button className="reviewBtn reviewBtnGuest" onClick={onRequireAuth}>Войти</button>}
        </>
      )}
      {bridge && (
        <button className="reviewBtn reviewBridge" onClick={() => { onClose(); requestOpenModule(bridge) }}>
          Продолжить «{bridge.title}» · {bridge.pct}%
        </button>
      )}
      <button className="reviewBtn reviewBtn--main" onClick={onClose}>Готово</button>
    </div>
  )
}
