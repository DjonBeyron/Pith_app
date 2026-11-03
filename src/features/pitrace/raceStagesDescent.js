// Раунд 4 «Спуск» → стадии: читка-караоке на скорости 1,1 (как акт «Читка» репетиции: rehearsal/read/ReadKaraoke.jsx) — Пит говорит всю фразу из кусков библиотеки (planDictor на rate × 1,1; звук играется
// с playbackRate 1,1 — директор включает wordLaneBuffers.setRateBoost на время раунда), потом человек говорит всю фразу ОДНИМ заходом, ровно один раз (maxTries 1). Подписи кусков — над дорожками, пилюли движка видны.
import { textOf } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { planDictor } from '../player/modules/rotate-phone/wordLaneDictor.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { TRAVEL_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { PIECE_PAD_MS } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { RH_TURN_MS } from '../rehearsal/rehearsalStages.js'
import { stepOf } from './raceStageKit.js'

const metroOf = (parts, durs) => parts.map((chunk, k) => ({ chunk, at: Math.round(TRAVEL_MS + durs.slice(0, k).reduce((a, d) => a + d + PIECE_PAD_MS, 0)), ms: Math.round(durs[k]) }))

export function descentStages(kit, act) {
  const { push, announce, chunks, lib } = kit
  const rate = kit.rate * act.rate
  const all = chunks.map((_, i) => i)
  const chunkMs = chunks.map((c, i) => (lib(i)?.ms ?? estChunkMs(c)) / rate)
  const mk = (id, o = {}) => stepOf(id, { parts: act.parts, text: textOf(chunks, act.parts), labels: all, active: act.parts, reps: [{ parts: act.parts }], chunkMs, ...o })
  announce(act)
  const dstep = mk('descent-d')
  const dplan = planDictor({ step: dstep, chunks, clips: null, audio: null, rate, clipMode: () => false, lib })
  const voiced = chunks.some((_, i) => lib(i))
  push({ type: 'read', act: 'descent', sid: 'descent-d', step: dstep, plan: dplan, metro: voiced ? dplan.reps[0].pieces.map(p => ({ chunk: p.chunk, at: Math.round(p.at), ms: Math.round(p.ms) })) : [] })
  const sstep = mk('descent-s', { maxTries: 1 }) // один раз, без повтора
  push({ type: 'turn', act: 'descent', sid: 'descent-t', step: sstep, ms: RH_TURN_MS })
  push({ type: 'student', act: 'descent', sid: 'descent-s', step: sstep, metro: metroOf(act.parts, act.parts.map(i => chunkMs[i])) })
}
