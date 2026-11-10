import { useState, useEffect, useCallback } from 'react'
import { emptyEar, earStep } from './pillStandEar.js'
import { emptyHist, histStep, clearHist } from './pillStandHistory.js'

// Панель «что слышит Vosk» стенда пилюль: состояние ear (pillStandEar.js) меняется на месте каждым событием трассы, а React получает копию не чаще раза в REDRAW_MS — перерисовок столько же,
// сколько видно глазу, а не по одной на кусок звука. История прошлых целей (pillStandHistory.js) — тем же ходом: строка прошлой цели закрывается тем, что панель знала ДО новой цели.
// → { ear (живое, для кадра и записи), view (копия для панели, view.hist — строки истории), clear() — «очистить» историю }.
export const REDRAW_MS = 90
const copy = (ear, hist) => ({ ...ear, hist: { list: hist.list.map(r => ({ ...r })) }, partials: ear.partials.slice(), finals: ear.finals.slice(), words: ear.words.slice(), backs: ear.backs.slice(), wrongs: ear.wrongs.slice(), reach: ear.reach.slice() })

export default function useStandEar(trace) {
  const [ear] = useState(emptyEar)
  const [hist] = useState(emptyHist)
  const [view, setView] = useState(() => copy(ear, hist))
  useEffect(() => {
    let timer = 0
    const off = trace.subscribe(e => { const hi = histStep(hist, e, ear); if ((earStep(ear, e) || hi) && !timer) timer = setTimeout(() => { timer = 0; setView(copy(ear, hist)) }, REDRAW_MS) })
    return () => { off(); clearTimeout(timer) }
  }, [trace, ear, hist])
  const clear = useCallback(() => { clearHist(hist); setView(copy(ear, hist)) }, [ear, hist])
  return { ear, view, clear }
}
