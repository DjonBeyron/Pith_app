// Рывок кромки заливки на неверное слово (проход 1 «Скажи», решение владельца 2026-11-09: «линия дёрнулась красным и вернулась назад плавно, но быстро»). Правило «неверного слова» —
// racePhraseWrongWord.js. Здесь только вид: атрибут data-nudge на пилюле (mark — сцена пишет его через pool.attr) включает CSS-анимацию веретена и ореола кромки .wlPillSparks i
// (word-lane-wide-fill.css: v3.3.314: красные только рамка, линия кромки и полоса за линией .wlPillFill::after — keyframes wlNudgeFill / wlNudgeBar, всего NUDGE_MS; жидкость цвет не меняет; кромка видна и при пустой заливке — рывок от начала).
// Заливку (pool.paintFill) не трогает. Атрибут снимается по animationend (событие псевдоэлемента всплывает до пилюли) или, если анимации нет (reduced motion, тесты), по таймеру.
export const NUDGE_MS = 400 // v3.3.309: рывок красной жидкости — короткий (0,4 с); в 3.3.307–308 «до 90 %» (0,52 с) владелец назвал огромным
export const NUDGE_EXTRA = 7 // насколько дальше линии (в % ширины пилюли) заходит красная полоса

/** → { fire(), stop(), on() }. mark(on) — поставить / снять data-nudge; el — узел пилюли (для animationend; без него — только таймер) */
export function createNudge({ mark, el = null, setTimer = setTimeout, clearTimer = clearTimeout, log = null }) { // log — журнал: через 80 мс после рывка проверяем, что CSS-анимация реально запущена (getAnimations), иначе «НЕ ЗАПУСТИЛАСЬ»
  let on = false, timer = 0
  const off = () => { if (!on) return; on = false; clearTimer(timer); timer = 0; mark(false) }
  const onEnd = e => { if (!e?.animationName || e.animationName === 'wlNudge' || e.animationName === 'wlNudgeFill') off() }
  el?.addEventListener?.('animationend', onEnd)
  return {
    /** Рывок: атрибут ставится заново (повтор — анимация с начала), снимается по animationend или через NUDGE_MS + 80 */
    fire(from = 0) { // from — доля заливки на экране 0…1: красная жидкость уходит от линии на NUDGE_EXTRA % ширины пилюли (--nw) и возвращается; --nf — доля заливки на экране, %
      try { const f = Math.min(1, Math.max(0, Number(from) || 0)) * 100; el?.style?.setProperty?.('--nf', String(Math.round(f * 10) / 10)); el?.style?.setProperty?.('--nw', String(NUDGE_EXTRA)) } catch { /* без стиля — рывок кромки остаётся */ }
      if (on) mark(false); on = true; mark(true)
      if (log && el?.getAnimations) setTimer(() => { try { const n = el.getAnimations({ subtree: true }).filter(a => /wlNudge/.test(a.animationName ?? '')).length; log(`[fill] рывок: запущено анимаций ${n}${n ? '' : ' — НЕ ЗАПУСТИЛАСЬ (CSS не применился или атрибут снят раньше)'}`) } catch { /* без getAnimations */ } }, 80); clearTimer(timer); timer = setTimer(off, NUDGE_MS + 80) },
    stop() { off(); el?.removeEventListener?.('animationend', onEnd) },
    on: () => on,
  }
}
