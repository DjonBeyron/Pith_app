import { useState, useRef, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { createDemoGate } from './racePhraseDemo.js'
import { RACE_LINES } from './raceLines.js'
import { lineCaption } from './raceSilentLine.js'
import { wordVoiced } from './racePhraseWordVoice.js'

const catalog = id => RACE_LINES.find(l => l.id === id)?.text ?? ''

// Голос и ворота демо-хода «Скажи» (racePhraseDemo.js, racePhraseDemoTurn.js) внутри useRaceActs: сцена ленты перед первым ходом шлёт fx.pre с rep.demo, директор отвечает e.demo(kit()).
// kit — свежие sayLine / sayText / cat директора (ref), подпись реплики — только у неозвученной (raceSilentLine.lineCaption: текст из настроек, нет — из каталога; озвученная — ''),
// hasWord — есть ли слово в библиотеке word_audio (racePhraseWordVoice.wordVoiced), claim / end — ворота на всю игру (один раз за игру, лимит показов на устройстве).
// Обрыв (пауза, сворачивание, смена стадии) делает сама сцена в stop(): она снимается вместе со стадией; после «Продолжить» ворота уже «сыграно» — демо не повторяется.
export function useRacePhraseDemo({ on, cat, sayLine, sayText, lines }) {
  const [gate] = useState(() => createDemoGate({ log: pLog }))
  const ref = useRef(null)
  useEffect(() => { ref.current = { cat, sayLine, sayText, lines } })
  return {
    kit() {
      if (!on) return null
      const c = () => ref.current ?? { cat, sayLine, sayText, lines }
      return {
        claim: p => gate.claim(p), end: why => gate.end(why),
        sayLine: (...a) => c().sayLine?.(...a), sayText: (...a) => c().sayText?.(...a), busyLeft: () => c().cat?.busyLeft?.() ?? 0,
        text: id => lineCaption(c().lines, id, catalog(id)), hasWord: w => wordVoiced(w),
      }
    },
    active: gate.active,
  }
}
