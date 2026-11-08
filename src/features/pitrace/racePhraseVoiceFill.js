// Заливка прохода 2 «Скажи» «ПОД ЗВУК» (замечание владельца 2026-11-08: «повтори фразу без остановок — заливка ступеньками по словам, а нужна непрерывная линия, как у обычной пилюли»).
// Источник — уровень микрофона того же слушателя фраз (onLevel: rms каждого куска звука, как у затвора тишины; голос — rms ≥ GATE_RMS и Пит не говорит), голос держится VOICE_HOLD_MS после
// последнего громкого куска (между кусками и в коротких стыках слов линия не дёргается). Пока голос есть — линия растёт НЕПРЕРЫВНО со скоростью под длину фразы: полная заливка за
// voiceFullMs(n) = VOICE_WORD_MS × слов + VOICE_TAIL_MS непрерывной речи. Пауза в речи — линия стоит (не откатывается). ЯКОРЯ: слушатель отдал слово k (onWord, и черновик) — цель не ниже
// границы слова k (edgeAt по границам слов на пилюле), так что медленная речь не отстаёт от услышанного. Голос без слов (шум) не уводит линию дальше VOICE_LEAD_WORDS слов за якорем и выше
// VOICE_CAP — 100 % только по итогу фразы (onPhrase: доезд и взлёт, racePhraseFill.finishDue). Журнал: «[fill] режим под звук: голос да|нет, цель …, экран …[, якорь слова k]» — при смене голоса или якоря.
import { edgeAt } from './racePhraseFill.js'
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'

export const VOICE_WORD_MS = 450   // на слово непрерывной речи
export const VOICE_TAIL_MS = 300   // и сверху на фразу
export const VOICE_HOLD_MS = 300   // голос «есть» столько после последнего громкого куска звука
export const VOICE_LEAD_WORDS = 1.5 // голосом — не дальше столько слов за последним услышанным словом
export const VOICE_CAP = 0.97      // без итога фразы — не выше
export const voiceFullMs = n => VOICE_WORD_MS * Math.max(1, n) + VOICE_TAIL_MS

/** Голос ли этот кусок звука: громче порога затвора тишины и не во время речи Пита */
export const isVoice = (rms, held) => !held && Number(rms) >= GATE_RMS

const num = v => (Number(v) || 0).toFixed(2).replace('.', ',')

/** → { level(rms, held, t), word(index), goal({ t, dt, edges, done, shown }), voice(t), value() }. n — слов во фразе; log — журнал «[fill] …» */
export function createVoiceFill({ n, log = () => {} }) {
  let v = 0, voiceAt = -Infinity, anchor = 0, said = null, newAnchor = false
  const voice = t => t - voiceAt < VOICE_HOLD_MS
  return {
    /** Кусок звука: rms — уровень, held — говорит Пит (не в счёт) */
    level(rms, held, t) { if (isVoice(rms, held)) voiceAt = t },
    /** Слушатель отдал слово index (черновик или итог): якорь — граница этого слова */
    word(index) { if (index + 1 > anchor) { anchor = Math.min(n, index + 1); newAnchor = true } },
    voice,
    value: () => v,
    /** Цель на кадр: t — сейчас, dt — мс с прошлого кадра, edges — границы слов (mask.edges) или null, done — итог фразы (100 %), shown — что на экране (журнал) */
    goal({ t, dt, edges = null, done = false, shown = 0 }) {
      if (done) return (v = 1)
      const on = voice(t)
      const floor = edgeAt(anchor, n, edges), cap = Math.min(VOICE_CAP, edgeAt(Math.min(n, anchor + VOICE_LEAD_WORDS), n, edges))
      if (on && v < cap) v = Math.min(cap, v + Math.max(0, dt) / voiceFullMs(n)) // линия не откатывается: выше потолка её поднял только якорь
      v = Math.max(v, floor)
      if (on !== said || newAnchor) {
        try { log(`[fill] режим под звук: голос ${on ? 'да' : 'нет'}, цель ${num(v)}, экран ${num(shown)}${newAnchor ? `, якорь слова ${anchor} → граница ${num(floor)}` : ''}`) } catch { /* журнал не мешает */ }
        said = on; newAnchor = false
      }
      return v
    },
  }
}
