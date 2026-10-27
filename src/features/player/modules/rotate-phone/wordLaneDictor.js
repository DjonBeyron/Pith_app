// План диктора для одной ступени: когда звучит каждый повтор, где в нём слово каждого куска и какая пилюля в какой дорожке заливается. Чистые функции — проверяются тестами.
// Ступень = N повторов одного высказывания (куски parts). Повтор r начинается в T_r (мс от старта ступени): в T_r включается звук (клип из общего файла перемоткой, либо голос системы по тексту),
// слово каждого куска начинается в T_r + смещение куска. Каждому куску повтора — своя пилюля в дорожке куска; она выкатывается так, чтобы к началу своего слова быть полностью открытой
// (wordLaneTimeline.TRAVEL_MS). Все пилюли едут с одной скоростью конвейера; повторы идут с шагом REP_MIN_MS (или длиннее) — пилюли одной дорожки не налезают друг на друга.
import { TRAVEL_MS, END_TAIL_MS, makeFillCurve } from './wordLaneTimeline.js'
import { laneOf, textOf } from './wordLaneRecipe.js'
import { clipsFor, playSpan, estChunkMs } from './wordLaneAudio.js'
import { MIN_WORD_MS } from './wordLanePlan.js'
import { mouthTrack, codeAt } from './wordLaneVisemes.js'

export const REP_MIN_MS = 1500     // шаг между повторами не короче: пилюли одной дорожки (20 % высоты ≈ 0,8 с пути) не налезают друг на друга
export const REP_GAP_MS = 800      // пауза после высказывания до следующего повтора
export const FIRST_AT_PAD_MS = 80  // слово первого повтора — через столько после полного открытия первой пилюли
export const PIECE_GAP_MS = 80     // пауза между кусками, когда каждый звучит отдельным файлом из библиотеки

/**
 * @param {object} p step — ступень рецепта (reps: [{ parts }]); chunks — тексты кусков; clips — клипы файла (clipsFromTimings/clipsFromFills) или null; audio — { wave, duration } для кривых заливки;
 * rate — скорость голоса урока (запись растягивается на 1/rate); clipMode(parts) → true: этот повтор играется ЗАПИСЬЮ АВТОРА (клип из файла) — у фразы из нескольких кусков так звучит только
 * ФИНАЛ (вся фраза), остальное — куски по отдельности из библиотеки озвучки слов; lib(chunk) → { ms } (длина озвучки куска из библиотеки, null — длина неизвестна) или null (куска в библиотеке нет)
 * @returns {{ reps: object[], pills: object[], listenMs: number, mouth: (t:number)=>number, mouthCode: (t:number)=>string }}
 */
export function planDictor({ step, chunks, clips = null, audio = null, rate = 1, clipMode = () => true, lib = () => null }) {
  const n = chunks.length
  const r = rate > 0 ? rate : 1
  const reps = step.reps.map((rep, idx) => {
    const row = clipMode(rep.parts) ? clipsFor(clips, n, rep.parts, idx) : null
    const span = row ? playSpan(row) : null
    let ms
    let offs
    let durs
    if (row) {
      offs = row.map(c => ((c.start - span.start) * 1000) / r)
      durs = row.map(c => Math.max(MIN_WORD_MS, ((c.end - c.start) * 1000) / r))
      ms = ((span.end - span.start) * 1000) / r
    } else {
      durs = rep.parts.map(i => (lib(i)?.ms ?? estChunkMs(chunks[i])) / r) // кусок из библиотеки (или оценка) играется с скоростью голоса урока
      offs = durs.map((_, k) => durs.slice(0, k).reduce((a, d) => a + d + PIECE_GAP_MS, 0))
      ms = offs.at(-1) + durs.at(-1) + 100
    }
    return { idx, parts: rep.parts, text: textOf(chunks, rep.parts), row, span, ms, offs, durs, mode: row ? 'clip' : 'words' }
  })
  const period = Math.max(REP_MIN_MS, ...reps.map(x => x.ms + REP_GAP_MS))
  const start0 = TRAVEL_MS + FIRST_AT_PAD_MS - (reps[0]?.offs[0] ?? 0)
  const pills = []
  for (const x of reps) {
    x.at = start0 + x.idx * period
    x.pieces = x.parts.map((chunk, k) => {
      const clip = x.row?.[k]
      const piece = {
        rep: x.idx, chunk, lane: laneOf(n, chunk, x.idx), at: x.at + x.offs[k], ms: x.durs[k], text: chunks[chunk],
        curve: clip && audio?.wave ? makeFillCurve(audio.wave, audio.duration, clip.start, clip.end) : null, clip: clip ?? null,
      }
      piece.id = pills.length
      pills.push(piece)
      return piece
    })
  }
  const last = reps.at(-1)
  const listenMs = last ? last.at + last.ms + END_TAIL_MS : 0

  // Громкость диктора в момент t — рот кота: по реальной волне файла, а без неё — пульсация на время слов
  const wave = audio?.wave
  const peak = Array.isArray(wave) && wave.length ? Math.max(...wave, 1e-9) : 0
  const per = peak && audio?.duration > 0 ? wave.length / audio.duration : 0
  const mouth = t => {
    for (const x of reps) {
      if (t < x.at || t >= x.at + x.ms) continue
      if (per && x.span) { const i = Math.floor((x.span.start + ((t - x.at) * r) / 1000) * per); return i >= 0 && i < wave.length ? Math.min(1, (wave[i] / peak) * 1.2) : 0 }
      for (const pc of x.pieces) if (t >= pc.at && t < pc.at + pc.ms) return 0.45 + 0.4 * (0.5 + 0.5 * Math.sin((t - pc.at) / 85))
      return 0
    }
    return 0
  }
  // Форма рта по буквам куска (или фразы целиком у записи автора): на «о» рот круглится. Громкость решает только, звучит ли слово сейчас
  const segs = reps.flatMap(x => (x.mode === 'clip' ? [{ at: x.at, ms: x.ms, track: mouthTrack(x.text, x.ms) }] : x.pieces.map(pc => ({ at: pc.at, ms: pc.ms, track: mouthTrack(pc.text, pc.ms) }))))
  const mouthCode = t => { const s = segs.find(g => t >= g.at && t < g.at + g.ms); return s ? codeAt(s.track, t - s.at) : 'X' }
  return { reps, pills, listenMs, mouth, mouthCode, period }
}
