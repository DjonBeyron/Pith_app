import { Brain } from 'lucide-react'

// Спящий мозг в углу блока «Памяти пора отдыхать» (LearnMainAction): тот же значок мозга, что на вкладке «Память»
// в нижней панели, а над ним три «Z» медленно и плавно всплывают — как искры над пятиугольником постоянной
// памяти (MemorySparks.jsx), только неспешнее. Пока мозг спит, искры пятиугольника не летят: эти две анимации
// сменяют друг друга и вместе не идут (LearnTab → MemoryLadder sparks). Только transform и opacity (learn-sleep.css)
export default function SleepingBrain() {
  return (
    <span className="lrSleep" aria-hidden="true">
      <i className="lrZ lrZ--1">Z</i>
      <i className="lrZ lrZ--2">Z</i>
      <i className="lrZ lrZ--3">Z</i>
      <Brain />
    </span>
  )
}
