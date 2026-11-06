// «Пит ныряет и уворачивается»: ОДНА правда по вертикали для головы Пита в режиме слежения (.wlCat--track). Раньше голову двигали два слоя: подъём / уход (transform самого .wlCat по классу wlCat--up,
// пружина 0,55 с, и правило паузы 108 %) и нырок привода (translate у svg). Они перебивали друг друга: пауза — голова уходила вниз .wlCat, а конец ступени тут же нырял и выныривал svg в центр (рывок вверх на паузе);
// «Продолжить» — .wlCat поднимался пружиной, а новая ступень сразу ныряла svg (рвано вниз, потом вверх); после прыжка уход головы (peek истёк) прерывался подъёмом для речи — голова «хотела нырнуть», подёргиваясь.
// Теперь в слежении .wlCat стоит неподвижно (word-lane-cat-dodge.css), а глубину ведёт только этот модуль — через --wl-dy (translate svg), x — через --wl-dx (transform svg); оба на .wlCat, пишутся только при изменении.
//  • Голова на виду, когда: класс wlCat--up (его по-прежнему ставит подъём головы для речи, wordLaneCatPeek) И не пауза (data-phase у .wl) И не идёт нырок И (после паузы) новая ступень уже назначила цель.
//  • Каждый переход атомарен: начатый уход / нырок / выныривание доигрывает, новая цель ставится в очередь и выполняется одним переходом после него. Цель x, пришедшая, пока голова внизу, ставится без перехода.
//  • Уход по peek (речь кончилась) ждёт HIDE_GRACE_MS: если голову снова позвали — она не дёргается. Нырок, пауза — сразу.
//  • Пауза: голова ныряет (dive-down) и остаётся внизу; конец старой ступени (нырок в центр) только меняет цель. После паузы голова ждёт цель новой ступени (dive / jump) и выныривает ОДИН раз — под её дорожкой;
//    цели нет за WAIT_TARGET_MS (ступень без пилюль) — выныривает на прежней цели (центр).
//  • Прыжок — только на виду и после выныривания; пока голова внизу — это просто новая цель.
// Класс wlCat--up и фазу читает MutationObserver (один на голову за игру; в тестах — sync()). Часы и таймеры приходят аргументами.
import { DIVE_DOWN_MS, DIVE_UP_MS, JUMP_MS } from './raceDodge.js'

export const DOWN_Y = '130%'        // глубина: с запасом за нижним краем (голова торчит на 96 % своей высоты) — скрыта уже на ~3/4 пути
export const HIDE_MS = 320          // уход без нырка (речь кончилась): CSS 0,3 с ease-in-out
export const RISE_MS = 460          // подъём для речи: CSS 0,44 с с пружиной
export const HIDE_GRACE_MS = 350    // уход по peek откладывается: позвали снова — голова не двигается
export const WAIT_TARGET_MS = 450   // после паузы ждём цель новой ступени не дольше

const heads = new WeakMap()
/** Голова в слежении (одна на элемент): создаёт при первом вызове (класс wlCat--track, x0, глубина по классу wlCat--up) */
export function headDepth(cat, o = {}) {
  if (!cat) return null
  if (!heads.has(cat)) heads.set(cat, createHeadDepth({ cat, ...o }))
  return heads.get(cat)
}

export function createHeadDepth({
  cat, x0 = 50, headW = 50, fast = false, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  isUp = () => cat.classList.contains('wlCat--up'), isPaused = () => cat.closest?.('.wl')?.dataset?.phase === 'paused',
}) {
  let pos = isUp() && !isPaused() ? 'up' : 'down' // куда голова пришла / идёт (timer — переход ещё идёт)
  let timer = 0, until = 0, jumpUntil = 0
  let xW = null, tx = x0, dxS = '', dyS = ''
  let hold = false      // нырок: вниз до конца, потом вверх
  let wait = false      // после паузы: ждём цель новой ступени
  let jumpDir = 0       // прыжок ждёт конца выныривания
  let kick = 'dive'     // чем выныривать: dive — dive-up (0,22 с), peek — rise (подъём для речи)
  let grace = 0, graceDone = false, waitT = 0, wasUp = isUp(), wasPaused = isPaused()
  const fx = ms => (fast ? 0 : ms)
  const mode = m => { if (cat.dataset.dodge !== m) cat.dataset.dodge = m }
  const dx = x => { xW = x; const v = `${(((x - 50) / headW) * 100).toFixed(2)}%`; if (v !== dxS) { dxS = v; cat.style.setProperty('--wl-dx', v) } }
  const dy = v => { if (v !== dyS) { dyS = v; cat.style.setProperty('--wl-dy', v) } }
  const want = () => isUp() && !isPaused() && !hold && !wait
  const arm = (ms, fn) => { until = now() + fx(ms); timer = setTimer(() => { timer = 0; fn() }, fx(ms)) }
  const unwait = () => { if (wait && !isPaused()) { wait = false; if (waitT) clearTimer(waitT); waitT = 0 } }
  const doJump = dir => {
    cat.dataset.hop = cat.dataset.hop === '1' ? '0' : '1'
    cat.dataset.dir = dir > 0 ? 'r' : 'l'
    mode('jump'); dx(tx); jumpDir = 0
    jumpUntil = now() + fx(JUMP_MS)
  }
  const apply = () => {
    if (timer) return // переход доигрывает: новая цель — после него, одним переходом
    if (pos === 'up') {
      if (!want()) {
        const dive = hold || isPaused() || wait
        if (!dive && !graceDone) { if (!grace) grace = setTimer(() => { grace = 0; graceDone = true; apply() }, fx(HIDE_GRACE_MS)); return } // уход по peek — с выдержкой
        graceDone = false; if (grace) { clearTimer(grace); grace = 0 }
        mode(dive ? 'dive-down' : 'hide'); dy(DOWN_Y); pos = 'down'
        arm(dive ? DIVE_DOWN_MS : HIDE_MS, () => { hold = false; apply() })
        return
      }
      if (grace) { clearTimer(grace); grace = 0 }
      graceDone = false
      if (xW !== tx) { if (jumpDir) doJump(jumpDir); else { hold = true; apply() } } // цель сменилась без прыжка — нырок
      return
    }
    if (xW !== tx) dx(tx) // внизу: x без перехода
    if (want()) { mode(kick === 'peek' ? 'rise' : 'dive-up'); dy('0%'); pos = 'up'; jumpDir = 0; arm(kick === 'peek' ? RISE_MS : DIVE_UP_MS, apply) }
  }
  const self = {
    /** Нырок к x: на виду — вниз до конца, x переставляется под краем, выныривает; уже внизу или уходит — только новая цель (вынырнет к ней одним переходом) */
    dive(x) { tx = x; kick = 'dive'; unwait(); if (pos === 'up') hold = true; apply() },
    /** Прыжок к x (dir −1 / +1): на виду — сразу; выныривает — после выныривания; внизу — новая цель */
    jump(x, dir) { if (x === xW && x === tx && pos === 'up' && !timer) return; tx = x; kick = 'dive'; unwait(); if (pos === 'up' && !timer && want()) doJump(dir); else { if (pos === 'up') jumpDir = dir; apply() } },
    /** Перечитать класс wlCat--up и паузу (MutationObserver; тесты зовут сами) */
    sync() {
      const up = isUp(), p = isPaused()
      if (up && !wasUp) kick = 'peek'
      if (p && !wasPaused) { wait = true; if (waitT) clearTimer(waitT); waitT = 0 }
      if (!p && wasPaused && wait) waitT = setTimer(() => { waitT = 0; wait = false; kick = 'dive'; apply() }, fx(WAIT_TARGET_MS))
      wasUp = up; wasPaused = p
      apply()
    },
    /** Сколько мс ещё до того, как голова встанет на место (на виду; спрятана и не нужна — 0) */
    left() {
      const t = now(), rest = timer ? Math.max(0, until - t) : 0
      const surf = pos === 'down' && isUp() && !isPaused() && !wait ? fx(kick === 'peek' ? RISE_MS : DIVE_UP_MS) : 0
      const jump = jumpDir ? fx(JUMP_MS) : Math.max(0, jumpUntil - t)
      return pos === 'down' ? (timer || surf ? rest + surf : 0) : rest + jump
    },
    /** Голова внизу или уходит (нырок, уход, пауза) */
    get under() { return pos === 'down' },
    /** Голова уходит вниз прямо сейчас (переход ещё идёт) */
    get sinking() { return pos === 'down' && !!timer },
    get x() { return tx },
  }
  mode('set'); dx(x0); dy(pos === 'up' ? '0%' : DOWN_Y)
  cat.classList.add('wlCat--track')
  globalThis.getComputedStyle?.(cat.querySelector?.('.wlCatSvg') ?? cat)?.transform // стиль «без перехода» применить сразу (одно чтение за игру), иначе первый переход поехал бы от нуля
  if (typeof MutationObserver === 'function' && cat.nodeType === 1) {
    const mo = new MutationObserver(() => self.sync())
    mo.observe(cat, { attributes: true, attributeFilter: ['class'] })
    const wl = cat.closest?.('.wl')
    if (wl) mo.observe(wl, { attributes: true, attributeFilter: ['data-phase'] })
  }
  return self
}
