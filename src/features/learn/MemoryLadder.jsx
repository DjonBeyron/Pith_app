import { Maximize2 } from 'lucide-react'
import MemoryWordChip from './MemoryWordChip.jsx'
import MemoryPermNode from './MemoryPermNode.jsx'
import MemoryLadderWires from './MemoryLadderWires.jsx'
import MemoryTurbulence from './MemoryTurbulence.jsx'
import MemoryLvlRings from './MemoryLvlRings.jsx'
import MemoryCount from './MemoryCount.jsx'

const SHOWN = 3 // слов на ступени главного экрана — остальные в «Все слова»

// Главный экран «Моей памяти»: шапка (children — LearnMainAction), справа
// счётчик слов во временной памяти (MemoryCount), три ступени лесенкой (новые → знакомые →
// усвоенные) и пятиугольник постоянной памяти; линии и шарики — слоем поверх
// (MemoryLadderWires). Число, название или ⤢ ступени — onOpen(1..3) (все
// слова ступени), пятиугольник — onOpen(4), слово — onWord. sleeping — мозг спит (всё повторено):
// искры над пятиугольником не летят, в шапке плывут «Z» (они сменяют друг друга, вместе не идут), а связь от шапки к
// ступеням оборвана, как порванный кабель (ladderTear.js)
export default function MemoryLadder({ ladder, sleeping = false, onOpen, onWord, children }) {
  const today = ladder.levels.map(l => l.words.filter(w => w.today).length)
  return (
    <div className="memZone">
      <MemoryTurbulence />
      {children}
      <div className="memStairs">
        <MemoryCount total={ladder.total} />
        {ladder.levels.map(l => (
          <div key={l.id} className={`memStair memStair--${l.id}`}>
            <div className={`memLvl memLvl--${l.id}`}>
              <MemoryLvlRings level={l.id} />
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
      <MemoryPermNode count={ladder.permanent.length} sparks={!sleeping} onOpen={() => onOpen(4)} />
      <MemoryLadderWires today={today} sleeping={sleeping} />
    </div>
  )
}
