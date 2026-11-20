// Рывок кромки заливки на неверное слово (проход 1 «Скажи», решение владельца 2026-11-09: «линия дёрнулась красным и вернулась назад плавно, но быстро»). Правило «неверного слова» —
// racePhraseWrongWord.js. Здесь только вид: атрибут data-nudge на пилюле (mark — сцена пишет его через pool.attr) включает CSS-анимацию веретена и ореола кромки .wlPillSparks i
// (word-lane-wide-fill.css: keyframes wlNudge — translateX вперёд на 8 px с красной подсветкой и плавный возврат, всего NUDGE_MS; кромка видна и при пустой заливке — рывок от начала).
// Заливку (pool.paintFill) не трогает. Атрибут снимается по animationend (событие псевдоэлемента всплывает до пилюли) или, если анимации нет (reduced motion, тесты), по таймеру.
export const NUDGE_MS = 520 // v3.3.307: красная заливка уходит до 90 % и возвращается (0,52 с); раньше только кромка на 8 px за 0,28 с
export const NUDGE_TO = 90   // до какой доли пилюли (%) заходит красная заливка

/** → { fire(), stop(), on() }. mark(on) — поставить / снять data-nudge; el — узел пилюли (для animationend; без него — только таймер) */
export function createNudge({ mark, el = null, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let on = false, timer = 0
  const off = () => { if (!on) return; on = false; clearTimer(timer); timer = 0; mark(false) }
  const onEnd = e => { if (!e?.animationName || e.animationName === 'wlNudge' || e.animationName === 'wlNudgeFill') off() }
  el?.addEventListener?.('animationend', onEnd)
  return {
    /** Рывок: атрибут ставится заново (повтор — анимация с начала), снимается по animationend или через NUDGE_MS + 80 */
    fire(from = 0) { // from — доля заливки на экране 0…1: красная заливка идёт от линии (--nf, %) до NUDGE_TO (--nw — длина, %), потом обратно
      try { const f = Math.min(1, Math.max(0, Number(from) || 0)) * 100; el?.style?.setProperty?.('--nf', String(Math.round(f * 10) / 10)); el?.style?.setProperty?.('--nw', String(Math.max(6, Math.round((NUDGE_TO - f) * 10) / 10))) } catch { /* без стиля — рывок кромки остаётся */ }
      if (on) mark(false); on = true; mark(true); clearTimer(timer); timer = setTimer(off, NUDGE_MS + 80) },
    stop() { off(); el?.removeEventListener?.('animationend', onEnd) },
    on: () => on,
  }
}
