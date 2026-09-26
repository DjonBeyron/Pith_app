import { useRef } from 'react'
import { Maximize2 } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import MemoryWordChip from './MemoryWordChip.jsx'
import MemoryPermNode from './MemoryPermNode.jsx'
import MemoryLadderWires from './MemoryLadderWires.jsx'

const SHOWN = 3 // слов на ступени главного экрана — остальные в «Все слова»

// Главный экран «Моей памяти»: шапка (children — LearnMainAction), справа
// число слов во временной памяти, три ступени лесенкой (новенькие → мои →
// родные) и пятиугольник постоянной памяти; линии и шарики — слоем поверх
// (MemoryLadderWires). Число, название или ⤢ ступени — onOpen(1..3) (все
// слова ступени), пятиугольник — onOpen('perm'), слово — onWord
export default function MemoryLadder({ ladder, onOpen, onWord, children }) {
  const zoneRef = useRef(null)
  const today = ladder.levels.map(l => l.words.filter(w => w.today).length)
  return (
    <div className="memZone" ref={zoneRef}>
      {children}
      <div className="memStairs">
        <div className="memSideLabel">
          <b>{ladder.total}</b>
          {plural(ladder.total, 'слово', 'слова', 'слов')} во временной памяти
        </div>
        {ladder.levels.map(l => (
          <div key={l.id} className={`memStair memStair--${l.id}`}>
            <div className={`memLvl memLvl--${l.id}`}>
              <div className="memLvlTop">
                <button className="memLvlOpen" onClick={() => onOpen(l.id)}>
                  <span className="memLvlLine">
                    <span className="memLvlCount">{l.words.length}</span>
                    <span className="memLvlName">{l.name}</span>
                  </span>
                  <span className="memLvlWhen">{l.when}</span>
                </button>
                <button className="memExpand" onClick={() => onOpen(l.id)} aria-label={`Все слова: ${l.name}`} title="Все слова">
                  <Maximize2 />
                </button>
              </div>
              <div className="memWords">
                {l.words.slice(0, SHOWN).map(w => <MemoryWordChip key={w.word} w={w} onClick={onWord} />)}
                {!l.words.length && <span className="memEmpty">пока пусто</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <MemoryPermNode count={ladder.permanent.length} onOpen={() => onOpen('perm')} />
      <MemoryLadderWires zoneRef={zoneRef} today={today} />
    </div>
  )
}
