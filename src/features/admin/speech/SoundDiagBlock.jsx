import { useState, useEffect } from 'react'
import { soundDiagLines } from '../../../shared/lib/soundDiag.js'

// «Звук приложения»: почему не играют звуки интерфейса (состояние контекста, аудиосессия, кто глушит, что проглочено). Обновляется раз в секунду, пока вкладка смонтирована.
export default function SoundDiagBlock() {
  const [lines, setLines] = useState(() => soundDiagLines())
  useEffect(() => {
    const id = setInterval(() => setLines(soundDiagLines()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <section className="aspBlock" data-testid="sound-diag">
      <h3 className="aspH">Звук приложения</h3>
      {lines.map((l, i) => <div key={i} className={`aspCapVal${l.includes('ПОЛНАЯ ТИШИНА') ? ' aspBad' : ''}`}>{l}</div>)}
    </section>
  )
}
