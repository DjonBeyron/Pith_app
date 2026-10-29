// Привязка уровня голоса к микрофону игры: подписка на «уровень 0..1 каждый кадр» (sayLevelSource) → ОДНА CSS-переменная --lvl на элементе (WordLaneMic.jsx, word-lane-mic.css).
// Без React и без сглаживания: атака в один кадр и спад (GAME_LEVEL_DECAY_MS) даёт сам источник уровня, кнопка/кольца/свечение считают себя из --lvl в CSS.
// В DOM пишем только заметные сдвиги (LVL_STEP): пока голос ровный, стиль не пересчитывается; нулём и единицей пишем всегда, чтобы кольца честно гасли и доходили до предела.
export const LVL_STEP = 0.004

/** Подписывает el на levels; onLevel(level) — для побочных нужд компонента (голос/тишина). Возвращает отписку, которая убирает --lvl */
export function bindLevelVar(el, levels, onLevel) {
  let shown = -1
  const off = levels.subscribe(level => {
    onLevel?.(level)
    if (level !== 0 && level !== 1 && Math.abs(level - shown) < LVL_STEP) return
    shown = level
    el.style.setProperty('--lvl', level.toFixed(3))
  })
  return () => { off(); el.style.removeProperty('--lvl') }
}
