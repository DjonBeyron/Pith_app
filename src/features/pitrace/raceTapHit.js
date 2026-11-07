// Попадание тапа в пилюлю широкой ленты («Встряхни память», этап 2 «Фразы», круг 1 «Пойми» и «Узнай» — racePhraseScene.js). Чистый модуль без DOM: прямоугольники пилюль снимает сцена
// (getBoundingClientRect живых пилюль в момент pointerdown — пилюли едут, кадр спустя они уже ниже), точку тапа даёт обработчик кнопки дорожки (clientX / clientY).
// Раньше тап брал «пилюлю ближе всего к центру экрана» по положению с прошлого кадра — и не смотрел, куда попал палец: когда две пилюли на экране, тап по верхней засчитывался
// как выбор нижней (ближе к середине) — ложное «неверно». Теперь выбор строго по точке тапа:
//  1) рамка пилюли (по X — с допуском HIT_PAD_X, по Y — строго): если попали в две (перекрылись) — та, чей центр ближе к точке;
//  2) рядом с рамкой — не дальше HIT_PAD_Y по вертикали: ближайшая по вертикали;
//  3) в зазоре между двумя пилюлями (одна выше точки, другая ниже) — ближайшая по вертикали, но не дальше GAP_MAX;
//  иначе — мимо (тап ничего не выбирает, сцена коротко подсвечивает точку). Отыгранные (spent) не выбираются никогда: если под пальцем отыгранная и живая перекрываются — живая.
export const HIT_PAD_Y = 12   // допуск по вертикали у одиночной пилюли, px
export const GAP_MAX = 24     // в зазоре между двумя пилюлями — не дальше этого от ближайшей, px
export const HIT_PAD_X = 12   // допуск по горизонтали, px

const inX = (r, x) => x >= r.left - HIT_PAD_X && x <= r.right + HIT_PAD_X
const gapY = (r, y) => (y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0)
const midY = (r, y) => Math.abs(y - (r.top + r.bottom) / 2)
const best = (list, y) => list.slice().sort((a, b) => gapY(a.rect, y) - gapY(b.rect, y) || midY(a.rect, y) - midY(b.rect, y))[0]

/**
 * pt = { x, y } (px экрана), cands = [{ id, rect: { left, right, top, bottom }, spent, cap }] → { hit (кандидат или null), why }.
 * why: 'рамка' | 'допуск' | 'зазор' | 'отыгранная' (под пальцем только отыгранная) | 'мимо'
 */
export function hitPill(pt, cands) {
  const all = (cands ?? []).filter(c => c?.rect && inX(c.rect, pt.x))
  const live = all.filter(c => !c.spent)
  const inside = live.filter(c => gapY(c.rect, pt.y) === 0)
  if (inside.length) return { hit: best(inside, pt.y), why: 'рамка' }
  const near = live.filter(c => gapY(c.rect, pt.y) <= HIT_PAD_Y)
  if (near.length) return { hit: best(near, pt.y), why: 'допуск' }
  const above = live.some(c => c.rect.bottom < pt.y), below = live.some(c => c.rect.top > pt.y)
  const gap = above && below ? live.filter(c => gapY(c.rect, pt.y) <= GAP_MAX) : []
  if (gap.length) return { hit: best(gap, pt.y), why: 'зазор' }
  if (all.some(c => c.spent && gapY(c.rect, pt.y) === 0)) return { hit: null, why: 'отыгранная' }
  return { hit: null, why: 'мимо' }
}

const r0 = v => Math.round(v)
export const rectText = r => (r ? `${r0(r.left)},${r0(r.top)}–${r0(r.right)},${r0(r.bottom)}` : '—')

/** Строка журнала одного тапа: «[tap] y=… x=… попал: «…» (rect …, рамка), кандидаты: «…» rect | …» */
export function tapLine(pt, cands, { hit, why }) {
  const list = (cands ?? []).map(c => `«${c.cap}» ${rectText(c.rect)}${c.spent ? ' (отыграна)' : ''}`).join(' | ') || 'нет'
  const head = `[tap] y=${r0(pt.y)} x=${r0(pt.x)}`
  return hit ? `${head} попал: «${hit.cap}» (rect ${rectText(hit.rect)}, ${why}), кандидаты: ${list}` : `${head} ${why === 'отыгранная' ? 'по отыгранной — ничего' : 'мимо'}, кандидаты: ${list}`
}

/** Колонка (0…2) под точкой x в поле box (left, width): зона тапа «Пальцами» — три равные колонки (.wlTap), как дорожки (LANE_EDGES 1/3, 2/3) */
export const zoneOf = (x, box) => Math.min(2, Math.max(0, Math.floor(((x - box.left) / (box.width || 1)) * 3)))

/** Журнал тапа тройки «Пальцами» (выбор по дорожке): дорожка кнопки, колонка под точкой (должны совпасть), пилюли на экране [{ lane, cap, rect }] и итог verdict */
export function trioTapLine(pt, lane, zone, pills, verdict) {
  const mine = pills.filter(p => p.lane === lane)
  const under = mine.find(p => p.rect && pt && pt.x >= p.rect.left && pt.x <= p.rect.right && pt.y >= p.rect.top && pt.y <= p.rect.bottom)
  const list = pills.map(p => `д${p.lane + 1} «${p.cap}» ${rectText(p.rect)}`).join(' | ') || 'нет'
  return `[tap] y=${r0(pt?.y ?? NaN)} x=${r0(pt?.x ?? NaN)} дорожка ${lane + 1}${zone !== lane ? ` (≠ колонка ${zone + 1}!)` : ''}: ${under ? `попал: «${under.cap}» (rect ${rectText(under.rect)})` : 'не в рамке'} → ${verdict}, кандидаты: ${list}`
}
