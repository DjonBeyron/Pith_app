import { Lock } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'

// Копилка слов: бесплатным видно первые WORDS_FREE_CAP слов + счётчик,
// остальные — за строкой-замком, которая открывает экран Pro.
// Вынесено из ProfileV2.jsx — тот упирался в мягкий потолок размера.
const WORDS_FREE_CAP = 20

export default function ProfileWordsList({ words, unlimited, onWantPro }) {
  const shown  = unlimited ? words : words.slice(0, WORDS_FREE_CAP)
  const hidden = words.length - shown.length

  return (
    <>
      <div className="pvWordsCount">
        {unlimited
          ? `${words.length} ${plural(words.length, 'слово', 'слова', 'слов')}`
          : `${Math.min(words.length, WORDS_FREE_CAP)} из ${WORDS_FREE_CAP} бесплатных`}
      </div>
      {shown.map(w => (
        <div key={w.id} className="pvWord pvWordCard">
          <span className="pvWordText">{w.word}</span>
          <span className="pvWordFrom">{w.from}</span>
        </div>
      ))}
      {hidden > 0 && (
        <button className="pvWord pvWordsLocked" onClick={onWantPro}>
          <span className="pvWordText pvIconLabel"><Lock size={13} /> ещё {hidden} {plural(hidden, 'слово', 'слова', 'слов')}</span>
          <span className="pvWordFrom">открыть с Pro →</span>
        </button>
      )}
    </>
  )
}
