// Рывок кромки заливки на неверное слово (проход 1 «Скажи», решение владельца 2026-11-09: «линия дёрнулась красным и вернулась назад плавно, но быстро»). Правило «неверного слова» —
// racePhraseWrongWord.js. Здесь только вид: атрибут data-nudge на пилюле (mark — сцена пишет его через pool.attr) включает CSS-анимацию веретена и ореола кромки .wlPillSparks i
// (word-lane-wide-fill.css: keyframes wlNudge — translateX вперёд на 8 px с красной подсветкой и плавный возврат, всего NUDGE_MS; кромка видна и при пустой заливке — рывок от начала).
// Заливку (pool.paintFill) не трогает. Атрибут снимается по animationend (событие псевдоэлемента всплывает до пилюли) или, если анимации нет (reduced motion, тесты), по таймеру.
export const NUDGE_MS = 280

/** → { fire(), stop(), on() }. mark(on) — поставить / снять data-nudge; el — узел пилюли (для animationend; без него — только таймер) */
export function createNudge({ mark, el = null, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let on = false, timer = 0
  const off = () => { if (!on) return; on = false; clearTimer(timer); timer = 0; mark(false) }
  const onEnd = e => { if (!e?.animationName || e.animationName === 'wlNudge') off() }
  el?.addEventListener?.('animationend', onEnd)
  return {
    /** Рывок: атрибут ставится заново (повтор — анимация с начала), снимается по animationend или через NUDGE_MS + 80 */
    fire() { if (on) mark(false); on = true; mark(true); clearTimer(timer); timer = setTimer(off, NUDGE_MS + 80) },
    stop() { off(); el?.removeEventListener?.('animationend', onEnd) },
    on: () => on,
  }
}
