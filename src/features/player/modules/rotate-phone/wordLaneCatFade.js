// Плавная смена лица кота (реакции love / shy и возврат в base): головы всех лиц лежат в дереве рядом, видна одна (CSS по data-face). Раньше смена атрибута переключала display —
// лицо сменялось мгновенным щелчком. Теперь ~140 мс идёт перекрёстное проявление, и обе головы на это время видны:
//  • новая голова стоит в DOM после прежней (рисуется поверх) — она проявляется 0 → 1 поверх прежней;
//  • новая стоит до прежней (рисуется под ней) — она сразу видна снизу, а прежняя уходит 1 → 0.
// Прозрачностью меняется всегда ТОЛЬКО верхняя голова, нижняя непрозрачна: просвета нет ни в какой момент (сквозь кота не видно пилюль и затемнений).
// Одна WAAPI-анимация opacity на ~140 мс по событию, не идл: на слабом устройстве и при reduced-motion её нет вовсе (лицо меняется сразу), как и без WAAPI (jsdom, старый WebView).
// Чистая функция: головы приходят аргументами, проверяется на подделках.
export const FADE_MS = 140
export const OUT_CLASS = 'wlHead--out' // прежняя голова остаётся display:inline, пока идёт переход (word-lane.css)
const FOLLOWING = 4                    // Node.DOCUMENT_POSITION_FOLLOWING: next стоит после prev → рисуется поверх

const noop = () => {}

/** Перекрёстно сменить голову prev → next (next уже показана по data-face, prev скрыта CSS и возвращается классом OUT_CLASS). Возвращает отмену: переход доведён до конца сразу, класс снят */
export function crossfadeHeads(prev, next, { ms = FADE_MS } = {}) {
  if (!prev || !next || prev === next || typeof next.animate !== 'function') return noop
  const over = (prev.compareDocumentPosition(next) & FOLLOWING) !== 0
  const top = over ? next : prev
  prev.classList.add(OUT_CLASS)
  const anim = top.animate(over ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in-out' })
  let done = false
  const finish = () => { if (done) return; done = true; prev.classList.remove(OUT_CLASS); anim.onfinish = null; anim.oncancel = null }
  anim.onfinish = finish
  anim.oncancel = finish
  return () => { finish(); anim.cancel() }
}
