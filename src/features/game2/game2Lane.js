import { visiblePills } from './timelinePlan.js'
import { creditWord, expiredPills, isStuck, HEARD_LAG_MS } from './game2Hits.js'

// Один проход ленты (один режим) — не React: часы, голос, слушатель и отметки пилюль. Всё внешнее приходит аргументами (тесты подставляют поддельные часы и слушатель).
//  • часы: t — мс от запуска ленты; каждый кадр двигают ленту (lane.setT). Голос включается, когда t дошёл до voiceAtMs; по факту старта звука часы сверяются (t0 сдвигается так, что голос и лента идут вместе);
//  • «Слушаю» (fill: karaoke): пилюля загорается в момент своего слова (lane.mark lit) и гаснет, когда слово кончилось;
//  • режимы со словами пользователя (input): слушатель живёт на проход, услышанное слово приписывается пилюле (creditWord: то же слово, момент в окне). Попал — hit (в «Ловлю» пилюля ещё и улетает вверх),
//    окно прошло — miss (полоски, пилюля уезжает вниз). «По памяти»: застрял на 3 с — подсказка первого слова (onHint), проход держится ещё HINT_HOLD_MS;
//  • конец: слово последней пилюли и голос закончились + окно + хвост; отмена (cancelled) — сразу, пилюли остаются как есть.
// → { credited, total, missed: [номера не пойманных пилюль], hinted }
export const TAIL_MS = 400
export const HINT_HOLD_MS = 2500 // после подсказки «По памяти» проход ещё столько открыт: подпись «Начни с» успевают прочитать

export function runLane({ mode, timeline, lane, voice = null, makeListener = null, onHint = null, cancelled = () => false, now = () => performance.now(), raf = f => requestAnimationFrame(f), log = () => {} }) {
  const pills = visiblePills(timeline, mode.show)
  const win = mode.window ?? 0
  const filled = new Set(), marked = new Set(), lit = new Set(), done = new Set()
  let endAt = Math.max(timeline.endMs, mode.voice ? timeline.voiceAtMs + timeline.voiceMs : 0) + win + TAIL_MS
  let t0 = now()
  let voiceOn = false, hinted = false, listener = null

  const onHeard = ({ text, at, tap }) => {
    const t = at - t0 - (tap ? 0 : HEARD_LAG_MS)
    const i = creditWord(pills, filled, text, t, win)
    log(`${mode.id}: услышал «${text}» t=${Math.round(t)} мс${tap ? ' (тап)' : ''} → ${i < 0 ? 'не засчитано (не в своё окно)' : `пилюля ${i}`}`)
    if (i < 0) return
    filled.add(i)
    lane.mark(i, 'hit', { rise: mode.input === 'catch', t })
  }

  return new Promise(resolve => {
    const finish = why => {
      try { voice?.stop() } catch { /* уже закончил */ }
      try { listener?.dispose() } catch { /* уже свободен */ }
      const missed = pills.filter(p => !filled.has(p.i)).map(p => p.i)
      log(`${mode.id}: проход закончен (${why}), поймано ${filled.size} из ${pills.length}`)
      resolve({ credited: filled.size, total: pills.length, missed, hinted })
    }
    if (makeListener && mode.input !== 'none' && pills.length) {
      try { listener = makeListener(onHeard); listener.start() } catch (e) { log(`слушатель не открылся: ${e?.message ?? e}`) }
    }
    const tick = () => {
      if (cancelled()) { finish('отмена'); return }
      const t = now() - t0
      lane.setT(t)
      if (mode.voice && voice && !voiceOn && t >= timeline.voiceAtMs) {
        voiceOn = true
        voice.start({ rate: mode.rate, gain: mode.gain, onStart: () => { t0 = now() - timeline.voiceAtMs } }) // звук пошёл: часы ленты сверены с голосом
      }
      for (const p of pills) {
        if (mode.fill === 'karaoke') {
          if (!lit.has(p.i) && t >= p.startMs) { lit.add(p.i); lane.mark(p.i, 'lit', { ms: p.endMs - p.startMs }) }
          if (!done.has(p.i) && t >= p.endMs) { done.add(p.i); lane.mark(p.i, 'done') }
        }
      }
      if (mode.input !== 'none') {
        for (const p of expiredPills(pills, filled, marked, t, win)) { marked.add(p.i); lane.mark(p.i, 'miss') }
      }
      if (mode.hint && pills.length && !hinted && isStuck({ t, firstStartMs: pills[0].startMs, credited: filled.size, hinted })) {
        hinted = true
        endAt = Math.max(endAt, t + HINT_HOLD_MS)
        log(`${mode.id}: застрял на 3 с — подсказка первого слова`)
        onHint?.(pills[0])
      }
      if (t >= endAt) { finish('время вышло'); return }
      raf(tick)
    }
    raf(tick)
  })
}
