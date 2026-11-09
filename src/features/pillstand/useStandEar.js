import { useState, useEffect } from 'react'
import { emptyEar, earStep } from './pillStandEar.js'

// Панель «что слышит Vosk» стенда пилюль: состояние ear (pillStandEar.js) меняется на месте каждым событием трассы, а React получает копию не чаще раза в REDRAW_MS — перерисовок столько же,
// сколько видно глазу, а не по одной на кусок звука. → { ear (живое, для кадра и записи), view (копия для панели) }.
export const REDRAW_MS = 90
const copy = ear => ({ ...ear, partials: ear.partials.slice(), finals: ear.finals.slice(), words: ear.words.slice(), backs: ear.backs.slice(), wrongs: ear.wrongs.slice(), reach: ear.reach.slice() })

export default function useStandEar(trace) {
  const [ear] = useState(emptyEar)
  const [view, setView] = useState(() => copy(ear))
  useEffect(() => {
    let timer = 0
    const off = trace.subscribe(e => { if (earStep(ear, e) && !timer) timer = setTimeout(() => { timer = 0; setView(copy(ear)) }, REDRAW_MS) })
    return () => { off(); clearTimeout(timer) }
  }, [trace, ear])
  return { ear, view }
}
