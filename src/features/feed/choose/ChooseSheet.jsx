import { X } from 'lucide-react'
import LessonPlayer from '../../player/LessonPlayerLazy.jsx'
import { verdictOf } from './chooseTasks.js'

// Шторка игры ленты «Выбери слово» (B4, стили — feed-choose.css). Снизу, над нижней навигацией: контекст карточки
// колоды (1–3 ноды) и задание word_choice играет тот же плеер, что у повторения, в такой же рамке (.reviewCardFrame:
// transform держит панель ответа внутри карточки, review.css). Без звука (item.textOnly) плеер играет беззвучно —
// текст остаётся текстом. Итог — короткая подпись текстом («Верно!» / «Не то — верно: …») и «Дальше»; без цифр и таблиц.
// item — открытая игра (chooseGame.js): { word, card, teacher, textOnly, result: { ok } | null };
// onFinishStats — ответ от плеера ({ wrong, timeMs }); onClose — «Дальше» / крестик (на ответ не влияет).
const noop = () => {}

export default function ChooseSheet({ item, onFinishStats, onClose }) {
  const { word, card, teacher, result } = item
  const verdict = verdictOf(result, card)
  return (
    <div className={`chooseSheet${item.textOnly ? ' chooseSheet--text' : ''}`} role="group" aria-label="Выбери слово">
      <div className="chooseHead">
        <span className="chooseTitle">Выбери слово</span>
        <button type="button" className="chooseClose" onClick={onClose} aria-label="Закрыть"><X size={18} strokeWidth={2.2} /></button>
      </div>
      <div className="chooseCard">
        <div className="reviewCardFrame">
          <LessonPlayer
            key={`${word}:${card.id}`}
            fallback={null}
            nodes={card.nodes}
            teacherName={teacher?.name}
            teacherLogo={teacher?.logo}
            teacherLogoCrop={teacher?.crop}
            muted={!!item.textOnly}
            startTyping={false}
            recordStats={false}
            onFinishStats={onFinishStats}
            onSummaryClose={noop}
            onClose={onClose}
          />
        </div>
      </div>
      {verdict && (
        <div className="chooseFoot">
          <p className={`chooseVerdict chooseVerdict--${verdict.kind}`} role="status">{verdict.text}</p>
          <button type="button" className="chooseNext" onClick={onClose}>Дальше</button>
        </div>
      )}
    </div>
  )
}
