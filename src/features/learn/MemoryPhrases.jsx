import { Star, ChevronRight } from 'lucide-react'
import MemoryPhraseRow from './MemoryPhraseRow.jsx'

const SHOWN = 3

// Раздел «Мои выученные фразы · N» под пятиугольником вкладки «Память»: коллекция
// фраз, которые собраны целиком (PROJECT.md → «Решения 2026-10-01 по фразам»).
// Три последние строками с номерами и «Вся коллекция · N» — окно со всем списком.
// У фраз расписания повторов нет — это коллекция, а у пустого списка раздела нет совсем
export default function MemoryPhrases({ list, today, onOpen, onAll }) {
  if (!list.length) return null
  return (
    <section className="memPhrases" aria-label="Мои выученные фразы">
      <h2 className="memPhrasesTitle"><Star aria-hidden="true" /> Мои выученные фразы · {list.length}</h2>
      <p className="memPhrasesLead">Твоя коллекция: фразы, которые ты выучил целиком</p>
      <div className="memPhrasesList">
        {list.slice(0, SHOWN).map(p => <MemoryPhraseRow key={p.id} p={p} today={today} onClick={onOpen} />)}
      </div>
      {list.length > SHOWN && (
        <button className="memPhrasesAll" onClick={onAll}>
          Вся коллекция · {list.length} <ChevronRight aria-hidden="true" />
        </button>
      )}
    </section>
  )
}
