// Привод «Пит ныряет и уворачивается» (DOM): ведёт модель raceDodge.js по событиям ступени (старт, зачёт, «не успел», конец) и по пилюлям ученика (движок useWordLanePills зовёт step на каждом кадре
// режима «Говорю» гонки) и двигает голову Пита. По x голова не скользит никогда: только нырок или прыжок.
//  • Глубину и x головы ведёт ОДИН владелец — raceHeadDepth.js (класс wlCat--track; --wl-dx / --wl-dy на .wlCat, translate / transform у <svg class="wlCatSvg">, data-dodge: set / dive-down / dive-up / hide / rise / jump).
//    Здесь только решение «что делать»: нырок → depth.dive(x), прыжок → depth.jump(x, dir). Начатый переход доигрывает, новая цель встаёт в очередь (там же пауза: нырок, выныривание после «Продолжить»).
//  • Пока ступень идёт, голова НЕ прячется между пилюлями: привод продлевает показ каждые PEEK_EVERY_MS (раньше — только когда пилюля «подходит», и после прыжка голова уходила и тут же поднималась для речи).
//  • Слабое устройство (scn--lite) и reduced-motion — переходы мгновенные (CSS), речь их не ждёт; порядок тот же. Шлейф прыжка — word-lane-cat-dodge.css (::before головы, data-hop / data-dir).
//  • left() — сколько мс ещё до того, как Пит встанет на место (нырок, прыжок, возврат из стороны): речь перед выездом пилюли ждёт этого (useRaceActs.pre, raceDiveWait.js).
//  • x головы между ступенями хранится в data-dodge-x (и в цели raceHeadDepth): следующая ступень вынырнет сразу к своей дорожке.
//  • Журнал: одна строка «[dodge] …» на переход (pLog).
import { createDodge, HEAD_W, HEAD_TOP, DIVE_DOWN_MS, DIVE_UP_MS, CENTER, ASIDE } from './raceDodge.js'
import { pLog } from '../../shared/lib/debug.js'
import { headDepth, DOWN_Y } from './raceHeadDepth.js'

export { DOWN_Y }

export const PEEK_MS = 700        // пилюля подходит или Пит прыгнул — голова торчит ещё столько (продлевается, пока нужно)
const PEEK_EVERY_MS = 250

/** Размер головы в долях сцены: ширина (% ширины) и макушка поднятой головы (% высоты: торчит на 96 %, word-lane.css). Нет размеров (тесты, скрытая сцена) — средние */
export function measureHead(cat) {
  const stage = cat?.parentElement
  const sw = stage?.offsetWidth ?? 0, sh = stage?.offsetHeight ?? 0
  if (!sw || !sh || !cat.offsetWidth) return { headW: HEAD_W, headTop: HEAD_TOP }
  return { headW: (cat.offsetWidth / sw) * 100, headTop: 100 - ((cat.offsetHeight * 0.96) / sh) * 100 }
}

const lab = (l, from) => (l === CENTER ? (from ? 'из центра' : 'в центр') : l === ASIDE ? (from ? 'из стороны' : 'в сторону') : l == null ? 'с прежнего места' : `${from ? 'с' : 'на'} ${l + 1}`)
/** Строка журнала перехода: «[dodge] нырок с дорожки 1 на 2 (зачёт)», «[dodge] прыжок с 1 на 2 (не успел): низ пилюли …» */
export function planLine(p, quick = false) {
  const from = p.kind === 'dive' && typeof p.from === 'number' ? `с дорожки ${p.from + 1}` : lab(p.from, true)
  const pill = p.pill ? `: низ пилюли ${(p.pill.y + 10).toFixed(1)} %, скорость ×${Number(p.pill.speed ?? 1).toFixed(2)}` : ''
  return `[dodge] ${p.kind === 'dive' ? 'нырок' : 'прыжок'} ${from} ${lab(p.toLane, false)} (${p.why}${p.same ? ', следующая на той же дорожке' : ''}${quick ? ', мгновенно' : ''})${pill} → x ${p.x.toFixed(1)} %`
}

const fastOf = cat => cat.classList.contains('scn--lite') || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
/** Голова в слежении по центру с начала гонки «Голосом» (WordLaneGame): общие фразы и плашки до первой ступени — тоже по центру, глубину ведёт raceHeadDepth.js */
export const trackHead = cat => (cat?.querySelector?.('.wlCatSvg') ? headDepth(cat, { headW: measureHead(cat).headW, fast: fastOf(cat) }) : null)

export function createDodgeDrive({ cat, lanes = [], peek = () => {}, log = pLog, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, quick }) {
  const svg = cat?.querySelector('.wlCatSvg')
  if (!svg) return null
  const { headW, headTop } = measureHead(cat)
  const fast = quick ?? fastOf(cat)
  const depth = headDepth(cat, { x0: Number(cat.style.getPropertyValue('--cat-x')) || 50, headW, fast, now, setTimer, clearTimer }) // голова уже в слежении (прошлая ступень, trackHead) — её цель и есть прежнее место
  const model = createDodge({ lanes, headTop, headW, x0: depth.x })
  let pills = []
  let peekAt = -Infinity

  const run = p => {
    if (!p?.kind) return
    cat.dataset.dodgeX = String(p.x)
    if (p.kind === 'jump') { log(planLine(p, fast)); peek(PEEK_MS); depth.jump(p.x, p.dir); return } // peek до прыжка: голова уже «нужна», прыжок не ждёт
    if (depth.sinking) log(`${planLine(p, fast)}; голова уже под краем — вынырнет здесь`) // нырок ещё идёт: вынырнет к новой цели одним переходом
    else if (depth.under) log(`${planLine(p, true)}; голова спрятана`)
    else log(planLine(p, fast))
    peek(PEEK_MS + DIVE_DOWN_MS + DIVE_UP_MS)
    depth.dive(p.x)
  }
  run(model.start())

  return {
    /** Кадр движка: events — события stepStudent этого кадра (claim / fail), pills — пилюли на экране */
    step(list = [], t = 0, events = []) {
      pills = list
      for (const e of events) {
        if (e.type === 'claim') run(model.claim(e.rep?.idx ?? 0))
        else if (e.type === 'fail') run(model.fail(e.rep?.idx ?? 0))
      }
      const s = model.step(list, t)
      s.plans.forEach(run)
      const n = now()
      if (n - peekAt >= PEEK_EVERY_MS) { peekAt = n; peek(PEEK_MS) } // ступень идёт — голова на виду всё время (не уходит и не поднимается между пилюлями)
      return s
    },
    /** Сколько мс ещё до того, как Пит встанет на место (речь ждёт): идёт нырок / прыжок или он в стороне и ждёт прохода пилюли */
    left: () => Math.max(0, depth.left(), model.backIn(pills)),
    /** Сцена кончилась: Пит нырком уходит в центр (нырок доигрывает таймер и после остановки движка) */
    stop() { run(model.end()) },
    get x() { return model.x },
  }
}
