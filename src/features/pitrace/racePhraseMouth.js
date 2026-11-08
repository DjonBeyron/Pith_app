// Рот Пита на ЦЕЛОЙ записи фразы этапа «Фразы» (замечание владельца с iPhone: «Пит не всегда открывает рот под фразу в последнем этапе»). Целая запись (racePhraseAudio.playPhraseAudio) играет не репликой и не словом
// библиотеки, поэтому ни дорожки рта (startCatLine), ни sayText (useWordLaneFlow) у неё нет — рот стоял закрытым. Здесь дорожка рта для catApi.speak:
//  • огибающая громкости буфера записи (audioEnvelope.envelopeFromSamples, 20 окон в секунду, 0…1 от самого громкого окна) — где в файле голос: от первого до последнего окна громче VOICE_AT;
//  • формы рта по буквам фразы (wordLaneVisemes.mouthTrack: английские сочетания, «о» круглится) раскладываются по этому отрезку; форма, под которой огибающая тише QUIET_AT (пауза между словами), выпадает — рот закрыт;
//  • буфера нет (<audio>, ещё не декодирован) — формы по буквам на всю длину записи (audio.duration), огибающая 0 точек.
// Журнал: «[mouth] фраза «…»: огибающая N точек». Чистые функции, буфер и скорость подставляются.
import { envelopeFromSamples, envelopeLevels, levelAt } from '../../shared/lib/audioEnvelope.js'
import { mouthTrack } from '../player/modules/rotate-phone/wordLaneVisemes.js'

export const VOICE_AT = 0.15 // окно громче 15 % самого громкого — голос
export const QUIET_AT = 0.08 // под формой тише 8 % — пауза, рот закрыт

/** Огибающая буфера: { hz, levels } или null (буфера нет / тишина) */
export function phraseEnvelope(buffer) {
  if (!buffer?.getChannelData) return null
  const lv = envelopeLevels(envelopeFromSamples(buffer.getChannelData(0), buffer.sampleRate))
  return lv && lv.levels.some(x => x > 0) ? lv : null
}

/**
 * Дорожка рта целой записи: text — фраза, buffer — AudioBuffer записи или null, durationS — длина файла (с) из библиотеки, rate — скорость голоса (буфер играет с playbackRate).
 * → { track, ms, points } — track для catApi.speak (мс от старта звука), ms — сколько звучит запись, points — окон огибающей (0 — без неё)
 */
export function phraseMouth({ text, buffer = null, durationS = 0, rate = 1 }) {
  const k = rate > 0 ? rate : 1
  const fileS = buffer?.duration > 0 ? buffer.duration : durationS > 0 ? durationS : 1.5
  const ms = Math.round((fileS * 1000) / k)
  const lv = phraseEnvelope(buffer)
  if (!lv) return { track: mouthTrack(text, ms), ms, points: 0 }
  const a = lv.levels
  let first = 0, last = a.length - 1
  while (first < a.length && a[first] < VOICE_AT) first++
  while (last > first && a[last] < VOICE_AT) last--
  if (first >= a.length) return { track: mouthTrack(text, ms), ms, points: a.length }
  const from = ((first / lv.hz) * 1000) / k, to = Math.min(ms, (((last + 1) / lv.hz) * 1000) / k)
  const loud = s => { const mid = ((s.at + s.end) / 2) * k / 1000; return levelAt(lv, mid) >= QUIET_AT }
  const track = mouthTrack(text, Math.max(1, to - from)).map(s => ({ ...s, at: s.at + from, end: s.end + from })).filter(loud)
  return { track, ms, points: a.length }
}
