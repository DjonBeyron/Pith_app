import BackButton from '../../shared/ui/BackButton.jsx'
import { splitByWord } from './reviewSession.js'
import ReviewPhraseWord from './ReviewPhraseWord.jsx'

// Шапка сессии повторения: слева «назад» (как везде в приложении), по центру —
// фраза слова под спойлером (слово закрыто шариками, после ответа плавно проявляется
// подсвеченным: ReviewPhraseWord меняет ширину слова, соседние части фразы расходятся или сходятся;
// вместо фразы — title). Прогресс сессии — не здесь, а внизу (ReviewProgress): фраза стоит на своём месте.
export default function ReviewHeader({ phrase, title, word, revealed, onClose }) {
  return (
    <div className="reviewHead">
      <BackButton onClick={onClose} label="Назад" className="reviewBack" />
      <div className="reviewHeadText">
        {phrase ? (
          <p className="reviewPhrase">
            {splitByWord(phrase, word).map((p, i) => (
              p.hit
                ? <ReviewPhraseWord key={i} text={p.text} revealed={revealed} />
                : <span key={i}>{p.text}</span>
            ))}
          </p>
        ) : title && <p className="reviewTitle">{title}</p>}
      </div>
    </div>
  )
}
