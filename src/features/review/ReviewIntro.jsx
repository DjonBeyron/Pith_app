import BackButton from '../../shared/ui/BackButton.jsx'
import { plural } from '../../shared/lib/plural.js'
import { introLines, sessionMinutes } from './reviewTeacher.js'

// Вступление к повторению: продолжаем вид чата — аватар и имя учителя, его
// реплики пузырями (тот же вид, что в уроке); «план» тремя ячейками (слов,
// минут, сообщений) стоит внизу, над «Начать». «Сообщение» — карточка: учитель пересылает кусочки
// чата (чат словом не называем). Слева сверху — «назад» вместо «Не сейчас».
export default function ReviewIntro({ teacher, words, cards, memory, phrase, onStart, onClose }) {
  const name = teacher?.name || 'Учитель'
  const lines = introLines({ words, memory, phrase })
  const n = words.length
  return (
    <div className="reviewIntro">
      <div className="reviewIntroTop"><BackButton onClick={onClose} label="Назад" /></div>
      <div className="reviewIntroBody">
        <div className="reviewTeacher">
          <span className="reviewAvatar">{teacher?.logo ? <img src={teacher.logo} alt="" /> : name.slice(0, 1).toUpperCase()}</span>
          <span className="reviewTeacherName">{name}</span>
        </div>
        <div className="reviewBubbles">
          {lines.map((t, i) => (
            <p key={i} className="reviewBubble reviewTeacherLine" style={{ animationDelay: `${i * 0.3}s` }}>{t}</p>
          ))}
        </div>
      </div>
      <div className="reviewIntroFoot">
        {n > 0 && (
          <div className="reviewPlan" style={{ animationDelay: `${lines.length * 0.3}s` }}>
            <div><b>{n}</b><span>{plural(n, 'слово', 'слова', 'слов')}</span></div>
            <div><b>~{sessionMinutes(cards)}</b><span>мин</span></div>
            <div><b>{cards}</b><span>{plural(cards, 'сообщение', 'сообщения', 'сообщений')}</span></div>
          </div>
        )}
        <button className="lrBtn lrBtnMain" onClick={onStart}>Начать</button>
      </div>
    </div>
  )
}
