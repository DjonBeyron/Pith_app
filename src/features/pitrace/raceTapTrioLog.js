// Журнал тапа тройки «Пальцами» (Гонка, режим «Тапаю», raceTapTrio.js): выбор там — по дорожке (кнопка .wlTapLane — колонка 1/3 поля), журнал снимает, что было под пальцем в момент касания:
// колонку под точкой (должна совпасть с дорожкой кнопки), пилюли на экране (дорожка, подпись, прямоугольник) и итог. Строку собирает raceTapHit.trioTapLine.
import { pLog } from '../../shared/lib/debug.js'
import { zoneOf, trioTapLine } from './raceTapHit.js'

export function logTrioTap(root, lane, pt, verdict, log = pLog) {
  if (!root?.querySelectorAll) return
  const box = root.getBoundingClientRect?.() ?? { left: 0, width: 1 }
  const pills = [...root.querySelectorAll('[data-held]')].map(el => ({ lane: Number(el.dataset?.lane), cap: el.getAttribute('data-cap') ?? '', rect: el.getBoundingClientRect?.() ?? null }))
  log(trioTapLine(pt, lane, pt ? zoneOf(pt.x, box) : lane, pills, verdict))
}
