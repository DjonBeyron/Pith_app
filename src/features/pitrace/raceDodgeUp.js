// «Пит уворачивается» на ОБРАТНОМ конвейере (проход B «Конвейера слов», владелец 2026-11-17): слова вылетают снизу — оттуда же, где торчит голова Пита, — и едут вверх. Пока слово только выезжает (низ экрана, зона головы), Пит
// отпрыгивает на x, где слов нет: дальше от всех выезжающих слов, но не дальше, чем нужно (стоит на месте, если уже чисто). Модель — чистая функция awayX; привод — createDodgeUp с тем же интерфейсом, что у createDodgeDrive (step / left / stop),
// голову ведёт ОДИН владелец — raceHeadDepth.js (jump / dive), здесь только решение «куда». Конец ступени — нырок в центр. Журнал: «[dodge] обратный конвейер: …».
import { LANE_X, PILL_W } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { measureHead } from './raceDodgeDrive.js'
import { headDepth } from './raceHeadDepth.js'
import { laneX, DODGE_EDGE, CENTER } from './raceDodge.js'
import { pLog } from '../../shared/lib/debug.js'

export const ZONE_Y = 34       // слово ещё внизу (логическая высота y — от выезда снизу вверх): пока y < ZONE_Y, оно в зоне головы и от него уворачиваются
const CLEAR = 0.4              // доля ширины головы, на которую слово не должно заходить (как в raceDodge: кончики ушей и усов)

/** Куда встать голове шириной headW (% ширины), стоящей в x, чтобы выезжающие слова (xs — их центры по x, %) не задели: x — прежний (чисто) или ближайший чистый / самый далёкий от слов. */
export function awayX(xs, x, headW) {
  const need = PILL_W / 2 + headW * CLEAR
  const dist = c => (xs.length ? Math.min(...xs.map(p => Math.abs(p - c))) : Infinity)
  if (dist(x) >= need) return x
  const half = headW / 2 + 2
  const cands = [DODGE_EDGE, laneX(0, headW), 50, laneX(2, headW), 100 - DODGE_EDGE, laneX(1, headW)].map(c => Math.min(100 - half + headW * 0.25, Math.max(half - headW * 0.25, c)))
  const clean = cands.filter(c => dist(c) >= need).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))
  return clean[0] ?? cands.reduce((best, c) => (dist(c) > dist(best) ? c : best), cands[0])
}

export function createDodgeUp({ cat, peek = () => {}, log = pLog, now = () => performance.now(), quick }) {
  const svg = cat?.querySelector('.wlCatSvg')
  if (!svg) return null
  const { headW } = measureHead(cat)
  const depth = headDepth(cat, { x0: Number(cat.style.getPropertyValue('--cat-x')) || 50, headW, fast: quick ?? false, now })
  let last = -Infinity, peekAt = -Infinity
  return {
    /** Кадр движка: list — пилюли ступени (state 'fly', lane, y — логическая высота: 0 у выезда); решает, куда отпрыгнуть от выезжающих слов */
    step(list = []) {
      const n = now()
      if (n - peekAt >= 250) { peekAt = n; peek(700) } // ступень идёт — голова на виду всё время (как у прямого конвейера)
      const low = list.filter(p => p.state === 'fly' && p.y < ZONE_Y)
      if (!low.length) return
      const x = awayX(low.map(p => LANE_X[p.lane] ?? 50), depth.x, headW)
      if (Math.abs(x - depth.x) < 0.5 || now() - last < 120) return
      last = now()
      cat.dataset.dodgeX = String(x)
      log(`[dodge] обратный конвейер: слово выезжает на ${low.map(p => p.lane + 1).join(', ')}, прыжок с x ${depth.x.toFixed(1)} на ${x.toFixed(1)} %`)
      depth.jump(x, x > depth.x ? 1 : -1)
    },
    /** Сколько мс ещё до того, как голова встанет на место */
    left: () => Math.max(0, depth.left()),
    /** Ступень кончилась: Пит нырком уходит в центр */
    stop() { if (depth.x !== 50) { log(`[dodge] обратный конвейер: ступень кончилась, нырок в ${CENTER === 'c' ? 'центр' : ''}`); cat.dataset.dodgeX = '50'; depth.dive(50) } },
    get x() { return depth.x },
  }
}
