import { Star, ChevronRight } from 'lucide-react'
import MemoryPhraseRow from './MemoryPhraseRow.jsx'

const SHOWN = 3

// Раздел «Фразы · N» под пятиугольником вкладки «Память» (PROJECT.md → «Решения
// 2026-10-01 по фразам»): три последние закреплённые фразы строками и «Все
// фразы · N» — окно со всем списком. У фраз расписания повторов нет — это
// коллекция закреплённых, поэтому слов к повтору здесь нет, а у пустого
// списка раздела нет совсем
export default function MemoryPhrases({ list, today, onOpen, onAll }) {
  if (!list.length) return null
  return (
    <section className="memPhrases" aria-label="Закреплённые фразы">
      <h2 className="memPhrasesTitle"><Star aria-hidden="true" /> Фразы · {list.length}</h2>
      <div className="memPhrasesList">
        {list.slice(0, SHOWN).map(p => <MemoryPhraseRow key={p.id} p={p} today={today} onClick={onOpen} />)}
      </div>
      {list.length > SHOWN && (
        <button className="memPhrasesAll" onClick={onAll}>
          Все фразы · {list.length} <ChevronRight aria-hidden="true" />
        </button>
      )}
    </section>
  )
}
