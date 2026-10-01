import { Star } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import { phraseDateLabel } from './phraseList.js'

// Строка закреплённой фразы: ★, фраза, «N слов · дата». Если урок фразы
// пропал (p.lost) — спокойная пометка «урок недоступен», сама фраза остаётся
export default function MemoryPhraseRow({ p, today, onClick }) {
  const n = p.words.length
  const meta = [n ? `${n} ${plural(n, 'слово', 'слова', 'слов')}` : '', phraseDateLabel(p.date, today)].filter(Boolean).join(' · ')
  return (
    <button className={p.lost ? 'memPhraseRow memPhraseRow--lost' : 'memPhraseRow'} onClick={() => onClick(p)}>
      <Star className="memPhraseStar" aria-hidden="true" />
      <span className="memPhraseText">
        <b>{p.title || 'Фраза'}</b>
        <small>{[p.lost ? 'урок сейчас недоступен' : '', meta].filter(Boolean).join(' · ')}</small>
      </span>
    </button>
  )
}
