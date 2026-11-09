import { useState, useRef, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { createDemoGate } from './racePhraseDemo.js'
import { RACE_LINES } from './raceLines.js'
import { lineCaption } from './raceSilentLine.js'
import { wordVoiced } from './racePhraseWordVoice.js'
import { wordVoiceMs } from './racePhraseAudio.js'
import { lineMs } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { fillLine } from '../rehearsal/rehearsalLines.js'
import { lineVoiced } from '../rehearsal/rehearsalQuiet.js'

const catalog = id => RACE_LINES.find(l => l.id === id)?.text ?? ''

// Голос и ворота демо-хода «Скажи» (racePhraseDemo.js, racePhraseDemoTurn.js) внутри useRaceActs: сцена ленты перед первым ходом шлёт fx.pre с rep.demo, директор отвечает e.demo(kit()).
// kit — свежие sayLine / sayText / cat директора (ref), подпись реплики — только у неозвученной (raceSilentLine.lineCaption: текст из настроек, нет — из каталога; озвученная — ''),
// hasWord — есть ли слово в библиотеке word_audio (racePhraseWordVoice.wordVoiced), claim / end — ворота на всю игру (один раз за игру, в каждой игре — без лимита на устройстве).
// lineMs / wordMs — длины реплик (озвучка из настроек, как у директора; неозвученная — 0) и голоса слов (racePhraseAudio.wordVoiceMs) ДО проигрывания: по ним сцена считает скорость демо-пилюли (racePhraseDemoPace.js).
// Обрыв (пауза, сворачивание, смена стадии) делает сама сцена в stop(): она снимается вместе со стадией; после «Продолжить» ворота уже «сыграно» — демо не повторяется.
export function useRacePhraseDemo({ on, cat, sayLine, sayText, lines, rate = 1 }) {
  const [gate] = useState(() => createDemoGate({ log: pLog }))
  const ref = useRef(null)
  useEffect(() => { ref.current = { cat, sayLine, sayText, lines, rate } })
  return {
    kit() {
      if (!on) return null
      const c = () => ref.current ?? { cat, sayLine, sayText, lines, rate }
      return {
        claim: p => gate.claim(p), end: why => gate.end(why),
        sayLine: (...a) => c().sayLine?.(...a), sayText: (...a) => c().sayText?.(...a), busyLeft: () => c().cat?.busyLeft?.() ?? 0,
        text: id => lineCaption(c().lines, id, catalog(id)), hasWord: w => wordVoiced(w),
        lineMs: id => (lineVoiced(c().lines, id) ? lineMs(fillLine(c().lines?.[id]), c().rate) : 0), wordMs: w => wordVoiceMs(w, c().rate),
      }
    },
    active: gate.active,
  }
}
