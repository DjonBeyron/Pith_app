import { Brain } from 'lucide-react'

// Спящий мозг в углу блока «Памяти пора отдыхать» (LearnMainAction): тот же значок мозга, что на вкладке «Память»
// в нижней панели (крупнее, линия тоньше, по центру блока по вертикали), а из-за него выплывают три «Z» и медленно
// всплывают, заходя чуть выше верхней границы блока (мозг — контур без заливки, поэтому «Z» прячет маска по его
// силуэту — .zMask в learn-sleep.css, узор фона остаётся виден), — как искры над пятиугольником постоянной памяти
// (MemorySparks.jsx), только неспешнее и реже. Пока мозг спит, искры пятиугольника не летят: эти две анимации
// сменяют друг друга и вместе не идут (LearnTab → MemoryLadder sparks). Только transform и opacity (learn-sleep.css)
export default function SleepingBrain() {
  return (
    <span className="lrSleep" aria-hidden="true">
      <span className="lrZs zMask">
        <i className="lrZ lrZ--1">Z</i>
        <i className="lrZ lrZ--2">Z</i>
        <i className="lrZ lrZ--3">Z</i>
      </span>
      <Brain strokeWidth={1.4} />
    </span>
  )
}
