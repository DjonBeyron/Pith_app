import { useReducer, useEffect } from 'react'
import { wordsPlan, warmItems } from './wordLaneStart.js'
import { warmProgress, warmLabel } from './wordLaneGate.js'
import { onSettled } from './wordLaneSettled.js'

// Прогресс прогрева озвучки для карточки игры: { done, ok, total, firstN, open (первые N готовы — ворота открыты), all (готово всё), label ('Готовлю звук… 7/15') }. Файлы обрабатывает wordLaneWarm.js (карточка показана)
// и тап «Начать» (wordLaneStart.js); каждый обработанный файл (wordLaneSettled.js) перерисовывает карточку. План пересчитывается на каждом рендере (он дешёвый), потому что библиотека слов подгружается позже карточки.
// listed — список библиотеки слов уже спрошен (иначе слов в плане ещё нет и «0 из 0» выглядело бы готовым): пока не спрошен, ворота считаются закрытыми.
export function useWarmProgress(cfg, lines, listed = true) {
  const [, bump] = useReducer(n => n + 1, 0)
  useEffect(() => onSettled(bump), [])
  const plan = wordsPlan({ cfg, lines })
  const p = warmProgress(warmItems(plan), plan.firstCount)
  const open = listed && p.open
  return { ...p, open, all: listed && p.all, label: warmLabel(p) }
}
