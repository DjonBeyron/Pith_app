// «Голос» в отчёте стенда пилюль = голос распознавания (v3.3.187). Каждый кусок звука в трассе ('level', standVoiceTap.js) несёт метку v — назвал ли его голосом счётчик слушателя
// (voskVoice.js: порог от шума микрофона и пика высказывания; тот же счётчик у правила слова, затвора тишины и уровня анимации). До этого отчёт мерил голос своей константой
// STAND_VOICE_RMS = 0,015: речь тихого микрофона iPhone (rms 0,003–0,005) шла в отчёте как «▽ тишина», «голос: не было», а зачёт — «голоса не было», хотя [word-ear] писал «голос начался».
// Константа осталась ЗАПАСНЫМ путём для трасс без метки (записи до v3.3.187, слушатель-заглушка в тестах).
// Здесь же — «на каком уровне шла заливка и почему» по одной цели (voiceFill → voiceFillLine): шум микрофона и пик речи (счётчик), усиление уровня и сам уровень 0…1 (wordLaneVoiceLevel.js — метки
// lv / g кусков), уровень после ворот голоса и цель заливки (кадры 'fill' вертикальной пилюли), задержка «начало голоса → заливка пошла на экране». Чистые функции над трассой.
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'

export const STAND_VOICE_RMS = GATE_RMS * 2.5 // 0,015 — только для трасс без метки голоса
export const FILL_SEEN = 0.01                 // заливка «пошла на экране»

/** Кусок звука — голос? (метка счётчика распознавания; нет метки — запасной порог) */
export const isVoice = e => (e.v != null ? e.v === 1 : e.rms >= STAND_VOICE_RMS)

/** События одной цели → { noise, peak, gain, lv, gated, goal, lagMs } | null (трасса без меток счётчика или голоса не было); until — момент зачёта (мс сессии): заливка считается до него */
export function voiceFill(events, until = Infinity) {
  const levels = events.filter(e => e.k === 'level' && e.v != null), voiced = levels.filter(e => e.v === 1)
  if (!voiced.length) return null
  const max = (list, f) => list.reduce((m, e) => Math.max(m, f(e) ?? 0), 0)
  const fills = events.filter(e => e.k === 'fill' && e.t <= until), start = voiced[0].t
  const seen = fills.find(e => e.t >= start && e.shown >= FILL_SEEN)
  return {
    noise: voiced.find(e => e.n != null)?.n ?? null, peak: max(voiced, e => e.rms),
    gain: levels.some(e => e.lv != null) ? Math.max(1, max(voiced, e => e.g)) : null, lv: levels.some(e => e.lv != null) ? max(levels, e => e.lv) : null,
    gated: fills.some(e => e.level != null) ? max(fills, e => e.level) : null, goal: max(fills, e => e.goal), lagMs: seen ? Math.round(seen.t - start) : null,
  }
}

const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d).replace('.', ','))
const mic = vf => `шум ${num(vf.noise, 4)}, пик речи ${num(vf.peak, 4)}`

/** «(счётчик распознавания: шум 0,0003, пик речи 0,0045)» — приписка к строке «голос: …» */
export const voiceNote = vf => (vf ? ` (счётчик распознавания: ${mic(vf)})` : '')

/** Строка «заливка голосом: …» вертикальной пилюли ('' — уровня в трассе нет: фраза «Скажи» наливается словами, не громкостью) */
export function voiceFillLine(vf) {
  if (!vf || vf.lv == null) return ''
  const norm = `уровень до ${num(vf.lv)} (усиление ×${num(vf.gain, 1)}: ${mic(vf)})`
  if (!(vf.lv > 0)) return `заливка голосом: НЕ шла — уровень 0: голос после усиления ×${num(vf.gain, 1)} ниже пола кривой 0,006 (${mic(vf)})`
  if (!(vf.gated > 0)) return `заливка голосом: НЕ шла — ${norm}, но ворота голоса не открылись (разогрев 450 мс после появления цели, глушение 1,1 с после зачёта или уровень не выше пола шума + 0,12 дольше 60 мс)`
  if (vf.lagMs == null) return `заливка голосом: НЕ шла — ${norm}, после ворот до ${num(vf.gated)}, но цель заливки ${num(vf.goal)} (кусок не активен или пилюля за краем)`
  return `заливка голосом: шла — ${norm}, после ворот до ${num(vf.gated)}, цель до зачёта ${num(vf.goal)}; начало голоса → заливка на экране ${vf.lagMs} мс`
}
