// Журнал тапа «Пальцами» в «Конвейере слов» (тройка пилюль по дорожкам, raceTapTrioLog.js): колонка под точкой и строка «[tap] …». Чистый модуль без DOM.
// Выбор пилюли широкой ленты по точке тапа (hitPill, круги фраз «Пойми» и «Узнай») удалён вместе с тап-кругами фраз (владелец 2026-11-24).
const r0 = v => Math.round(v)
export const rectText = r => (r ? `${r0(r.left)},${r0(r.top)}–${r0(r.right)},${r0(r.bottom)}` : '—')

/** Колонка (0…2) под точкой x в поле box (left, width): зона тапа «Пальцами» — три равные колонки (.wlTap), как дорожки (LANE_EDGES 1/3, 2/3) */
export const zoneOf = (x, box) => Math.min(2, Math.max(0, Math.floor(((x - box.left) / (box.width || 1)) * 3)))

/** Журнал тапа тройки «Пальцами» (выбор по дорожке): дорожка кнопки, колонка под точкой (должны совпасть), пилюли на экране [{ lane, cap, rect }] и итог verdict */
export function trioTapLine(pt, lane, zone, pills, verdict) {
  const mine = pills.filter(p => p.lane === lane)
  const under = mine.find(p => p.rect && pt && pt.x >= p.rect.left && pt.x <= p.rect.right && pt.y >= p.rect.top && pt.y <= p.rect.bottom)
  const list = pills.map(p => `д${p.lane + 1} «${p.cap}» ${rectText(p.rect)}`).join(' | ') || 'нет'
  return `[tap] y=${r0(pt?.y ?? NaN)} x=${r0(pt?.x ?? NaN)} дорожка ${lane + 1}${zone !== lane ? ` (≠ колонка ${zone + 1}!)` : ''}: ${under ? `попал: «${under.cap}» (rect ${rectText(under.rect)})` : 'не в рамке'} → ${verdict}, кандидаты: ${list}`
}
