import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import MemoryPhraseRow from './MemoryPhraseRow.jsx'
import MemoryStartedRow from './MemoryStartedRow.jsx'

const SHOWN = 3

// Раздел фраз под пятиугольником вкладки «Память» — две вкладки рядом (PROJECT.md → «Решения 2026-10-01 по
// фразам»; счётчик — маленькой плашкой в самой вкладке, цвет вкладки: выученные — фиолетовый, начатые — небесный): «Мои выученные фразы · N» — коллекция фраз, собранных целиком (три последние строками с номерами
// и «Вся коллекция · N» — окно со всем списком; расписания повторов у фраз нет) и «Мои начатые фразы · M» —
// модули, которые начаты, но пройдены не на 100% (тап — открыть и продолжить, «Все начатые · M» — окно со
// всем списком). Если фраз нет совсем — раздела нет. Открывается на выученных, а если их нет — на начатых
export default function MemoryPhrases({ list, started = [], today, onOpen, onAll, onOpenStarted, onAllStarted }) {
  const [tab, setTab] = useState(list.length || !started.length ? 'learned' : 'started')
  if (!list.length && !started.length) return null
  const learned = tab === 'learned'
  const shown = learned ? list : started
  return (
    <section className="memPhrases" aria-label="Мои фразы">
      <div className="memPhrasesTabs" role="tablist">
        <button role="tab" aria-selected={learned} className={learned ? 'memPhrasesTab memPhrasesTab--learned memPhrasesTab--on' : 'memPhrasesTab memPhrasesTab--learned'} onClick={() => setTab('learned')}>
          <span>Выученные фразы</span> <b className="memPhrasesCount">{list.length}</b>
        </button>
        <button role="tab" aria-selected={!learned} className={learned ? 'memPhrasesTab memPhrasesTab--started' : 'memPhrasesTab memPhrasesTab--started memPhrasesTab--on'} onClick={() => setTab('started')}>
          <span>Начатые фразы</span> <b className="memPhrasesCount">{started.length}</b>
        </button>
      </div>
      <p className="memPhrasesLead">
        {learned ? 'Твоя коллекция: фразы, которые ты выучил целиком' : 'Фразы, которые ты начал, но ещё не прошёл до конца'}
      </p>
      <div className="memPhrasesList">
        {!shown.length && <p className="memPhrasesEmpty">{learned ? 'Пока нет выученных фраз' : 'Начатых фраз нет — все пройдены или ещё не начаты'}</p>}
        {learned
          ? list.slice(0, SHOWN).map(p => <MemoryPhraseRow key={p.id} p={p} today={today} onClick={onOpen} />)
          : started.slice(0, SHOWN).map((p, i) => <MemoryStartedRow key={p.id} p={p} idx={i + 1} onClick={onOpenStarted} />)}
      </div>
      {shown.length > SHOWN && (
        <button className="memPhrasesAll" onClick={learned ? onAll : onAllStarted}>
          {learned ? 'Вся коллекция' : 'Все начатые'} · {shown.length} <ChevronRight aria-hidden="true" />
        </button>
      )}
    </section>
  )
}
