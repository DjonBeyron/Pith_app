import { plural } from '../../shared/lib/plural.js'
import { phraseDateLabel } from './phraseList.js'

// Строка выученной фразы: её номер в коллекции (по порядку выучивания), название и
// «N слов · дата». Если урок фразы пропал (p.lost) — спокойная пометка «урок сейчас
// недоступен», сама фраза остаётся
export default function MemoryPhraseRow({ p, today, onClick }) {
  const n = p.words.length
  const meta = [n ? `${n} ${plural(n, 'слово', 'слова', 'слов')}` : '', phraseDateLabel(p.date, today)].filter(Boolean).join(' · ')
  return (
    <button className={p.lost ? 'memPhraseRow memPhraseRow--lost' : 'memPhraseRow'} onClick={() => onClick(p)}>
      <span className="memPhraseNum" aria-label={`Номер ${p.n}`}>{p.n}</span>
      <span className="memPhraseText">
        <b>{p.title || 'Фраза'}</b>
        <small>{[p.lost ? 'урок сейчас недоступен' : '', meta].filter(Boolean).join(' · ')}</small>
      </span>
    </button>
  )
}
