import { useState, useRef, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { createDemoGate, DEMO_LINE } from './racePhraseDemo.js'
import { mountDemo } from './racePhraseDemoView.js'
import { RACE_LINES } from './raceLines.js'

const DEFAULT_CAPTION = RACE_LINES.find(l => l.id === DEMO_LINE)?.text ?? ''

// Директор демо перед кругом «Скажи» (racePhraseDemo.js) внутри useRaceActs: after(stage, fn) — обёртка перехода плашки (rh.afterCount): у плашки phrases2-ann с stage.demo сначала идёт демо, потом fn.
// Голос — свежие sayLine / sayText / cat директора (ref), подпись — текст реплики race_phrases_demo из настроек (нет — из каталога). Пауза (cat.onStop) и смена стадии (sid) обрывают демо.
export function useRacePhraseDemo({ on, running, cat, sayLine, sayText, lines }) {
  const [gate] = useState(() => createDemoGate({ log: pLog }))
  const ref = useRef(null)
  useEffect(() => { ref.current = { cat, sayLine, sayText, lines } })
  useEffect(() => cat?.onStop?.(() => gate.stop('пауза')), [cat, gate]) // cat — новый объект на рендер: подписка переставляется, набор подписчиков у Пита общий
  const sid = running?.sid
  useEffect(() => () => gate.stop('смена стадии'), [sid, gate])
  return {
    after(stage, fn) {
      if (!on) { fn(); return }
      const c = () => ref.current ?? { cat, sayLine, sayText, lines }
      gate.after(stage, fn, {
        caption: c().lines?.[DEMO_LINE]?.text || DEFAULT_CAPTION,
        sayLine: (...a) => c().sayLine?.(...a), sayText: (...a) => c().sayText?.(...a), busyLeft: () => c().cat?.busyLeft?.() ?? 0,
        mount: mountDemo,
      })
    },
    active: gate.active,
  }
}
