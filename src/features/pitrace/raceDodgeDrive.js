// Привод «Пит ныряет и уворачивается» (DOM): ведёт модель raceDodge.js по событиям ступени (старт, зачёт, «не успел», конец) и по пилюлям ученика (движок useWordLanePills зовёт step на каждом кадре
// режима «Говорю» гонки) и двигает голову Пита. По x голова не скользит никогда: только нырок или прыжок.
//  • Голова (.wlCat) получает класс wlCat--track: её left встаёт на 50 %, а положение ведёт ОДНА обёртка — <svg class="wlCatSvg"> (вся голова): x — transform: translateX(--wl-dx), глубина нырка — translate: 0 --wl-dy
//    (разные свойства — разные переходы: пока голова под краем, x переставляется без перехода). Только композитор, без layout. Подъём головы (transform самого .wlCat, wordLaneCatPeek) от этого не зависит.
//  • data-dodge на .wlCat выбирает переход (word-lane-cat-dodge.css): set — без перехода (первая установка, голова спрятана); dive-down — голова уходит вниз за край (DIVE_DOWN_MS);
//    dive-up — x уже новый, голова выныривает с лёгким перелётом (DIVE_UP_MS); jump — прыжок-пружина с наклоном и сжатием (JUMP_MS, keyframes), data-dir — l / r.
//    Голова спрятана (нет wlCat--up) — нырок не нужен: x переставляется сразу (set), выныривает её речь. Слабое устройство (scn--lite) и reduced-motion — переходы мгновенные (CSS), речь их не ждёт; порядок тот же.
//  • left() — сколько мс ещё до того, как Пит встанет на место (нырок, прыжок, возврат из стороны): речь перед выездом пилюли ждёт этого (useRaceActs.pre, raceDiveWait.js).
//  • x головы между ступенями хранится в data-dodge-x; недоигранный нырок (таймер выныривания) — в общем на голову слоте: следующая ступень вынырнет сразу к своей дорожке.
//  • Журнал: одна строка «[dodge] …» на переход (pLog).
import { createDodge, HEAD_W, HEAD_TOP, DIVE_DOWN_MS, DIVE_UP_MS, JUMP_MS, CENTER, ASIDE } from './raceDodge.js'
import { pLog } from '../../shared/lib/debug.js'

export const PEEK_MS = 700        // пилюля подходит или Пит прыгнул — голова торчит ещё столько (продлевается, пока нужно)
export const DOWN_Y = '130%'      // глубина нырка: с запасом за нижним краем (торчит на 96 % своей высоты) — скрыта уже на ~3/4 пути, x переставляется не на виду, даже если кадр опоздал
const PEEK_EVERY_MS = 250
const slots = new WeakMap()       // голова → { timer, x, until }: нырок переживает смену ступени

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

export function createDodgeDrive({ cat, lanes = [], peek = () => {}, log = pLog, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, quick }) {
  const svg = cat?.querySelector('.wlCatSvg')
  if (!svg) return null
  const { headW, headTop } = measureHead(cat)
  const x0 = Number(cat.dataset.dodgeX ?? cat.style.getPropertyValue('--cat-x')) || 50
  const model = createDodge({ lanes, headTop, headW, x0 })
  const fast = quick ?? (cat.classList.contains('scn--lite') || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  if (!slots.has(cat)) slots.set(cat, { timer: 0, x: x0, until: 0 })
  const slot = slots.get(cat)
  const put = (mode, x, dir = 0) => {
    cat.dataset.dodge = mode
    if (dir) cat.dataset.dir = dir > 0 ? 'r' : 'l'
    if (x != null) svg.style.setProperty('--wl-dx', `${(((x - 50) / headW) * 100).toFixed(2)}%`)
  }
  const dy = v => svg.style.setProperty('--wl-dy', v)
  const up = () => !!cat.classList.contains('wlCat--up')
  if (!cat.classList.contains('wlCat--track')) { put('set', x0); dy('0%'); cat.classList.add('wlCat--track'); globalThis.getComputedStyle?.(svg).transform } // стиль «без перехода» применить сразу (одно чтение стиля за игру), иначе первый переход поехал бы от нуля
  let pills = []
  let peekAt = -Infinity

  const surface = () => { slot.timer = 0; put('dive-up', slot.x); dy('0%') }
  const run = p => {
    if (!p?.kind) return
    cat.dataset.dodgeX = String(p.x)
    if (p.kind === 'jump') {
      if (slot.timer) { clearTimer(slot.timer); slot.timer = 0 }
      log(planLine(p, fast)); dy('0%'); cat.dataset.hop = cat.dataset.hop === '1' ? '0' : '1'; put('jump', p.x, p.dir)
      slot.x = p.x; slot.until = now() + (fast ? 0 : JUMP_MS); peek(PEEK_MS)
      return
    }
    slot.x = p.x
    if (slot.timer) { log(`${planLine(p, fast)}; голова уже под краем — вынырнет здесь`); return } // нырок ещё идёт: вынырнет к новой цели в свой срок
    if (!up()) { log(`${planLine(p, true)}; голова спрятана`); put('set', p.x); dy('0%'); slot.until = now(); return }
    log(planLine(p, fast)); peek(PEEK_MS + DIVE_DOWN_MS + DIVE_UP_MS)
    const down = fast ? 0 : DIVE_DOWN_MS
    put('dive-down'); dy(DOWN_Y)
    slot.until = now() + down + (fast ? 0 : DIVE_UP_MS)
    slot.timer = setTimer(surface, down)
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
      if (s.need && n - peekAt >= PEEK_EVERY_MS) { peekAt = n; peek(PEEK_MS) }
      return s
    },
    /** Сколько мс ещё до того, как Пит встанет на место (речь ждёт): идёт нырок / прыжок или он в стороне и ждёт прохода пилюли */
    left: () => Math.max(0, slot.until - now(), model.backIn(pills)),
    /** Сцена кончилась: Пит нырком уходит в центр (нырок доигрывает таймер и после остановки движка) */
    stop() { run(model.end()) },
    get x() { return model.x },
  }
}
