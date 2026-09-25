import { useState } from 'react'
import { KNOW_STEP } from './learnView.js'
import StrengthDots from '../../shared/ui/StrengthDots.jsx'

// Карта памяти: фразы свёрнуты, внутри — слова с силой 1–5 (шаг памяти).
// Слово без колоды серое — «повторение скоро» (в расписание не входит);
// слово фразы, которое ещё не проходили, — «не пройдено». Тап по слову —
// onWord (шторка: пройти урок / повторить сейчас).
export default function LearnMemoryMap({ phrases, onWord }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = id => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  if (!phrases.length) return null
  return (
    <div className="lrMap">
      <p className="lrSectionTitle">Карта памяти</p>
      {phrases.map(p => {
        const inMemory = p.words.filter(w => w.step)
        const known = inMemory.filter(w => w.step >= KNOW_STEP).length
        return (
          <div key={p.id} className="lrPhrase">
            <button className="lrPhraseHead" aria-expanded={open.has(p.id)} onClick={() => toggle(p.id)}>
              <span className="lrPhraseTitle">{p.title}</span>
              <span className="lrPhraseMeta">
                {p.due && <span className="lrDueDot" aria-label="есть что повторить" />}
                знаю {known} из {p.words.length}
              </span>
            </button>
            {open.has(p.id) && p.words.map(w => (
              <button key={w.word} className={w.step && w.hasDeck ? 'lrWord' : 'lrWord lrWordMuted'} onClick={() => onWord(w, p)}>
                <span className="lrWordText">{w.word}</span>
                {!w.step ? <span className="lrWordNote">не пройдено</span>
                  : !w.hasDeck ? <span className="lrWordNote">повторение скоро</span>
                    : <StrengthDots step={w.step} />}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
