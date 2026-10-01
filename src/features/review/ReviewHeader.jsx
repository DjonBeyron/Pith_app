import BackButton from '../../shared/ui/BackButton.jsx'
import { splitByWord } from './reviewSession.js'

// Шапка сессии повторения: слева «назад» (как везде в приложении), по центру —
// фраза слова под спойлером (слово закрыто шариками, после ответа проявляется
// подсвеченным; вместо фразы — title). Прогресс сессии — не здесь, а внизу
// (ReviewProgress): фраза стоит на своём месте.
export default function ReviewHeader({ phrase, title, word, revealed, onClose }) {
  return (
    <div className="reviewHead">
      <BackButton onClick={onClose} label="Назад" className="reviewBack" />
      <div className="reviewHeadText">
        {phrase ? (
          <p className="reviewPhrase">
            {splitByWord(phrase, word).map((p, i) => (
              p.hit
                ? <span key={i} className={revealed ? 'reviewPhraseWord' : 'reviewPhraseHidden'}>
                    {revealed ? p.text : '●'.repeat(p.text.length)}
                  </span>
                : <span key={i}>{p.text}</span>
            ))}
          </p>
        ) : title && <p className="reviewTitle">{title}</p>}
      </div>
    </div>
  )
}
