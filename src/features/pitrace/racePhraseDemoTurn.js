// Демо-ход круга «Скажи» на ЖИВОЙ пилюле (racePhraseScene.js зовёт перед первым ходом; скрипт и ворота — racePhraseDemo.js). Пилюля — из пула сцены, та же, что у настоящих ходов: широкая, data-mode='say',
// бледная (data-faded), маска-кирпичики (mountMask) и data-demo; скорость — круга (SAY_SPEED). Выкатывается уже выезжающей из-под верхнего затемнения (DEMO_Y: полёт с atMs), чтобы скрипт ≈ 6–7 с
// уложился в зону чтения (к взлёту центр ≈ 45–60 % высоты). Заливка — своя плавная (createFillView: цель — доля слов, экран догоняет каждый кадр), перед взлётом доезжает до 100 % (не дольше RISE_WAIT_MS),
// взлёт — pool.rise (как при зачёте: data-lock, вспышка ленты, щелчок). Слушатель фраз на демо-ходу не слушает: у сцены ещё нет кандидатов (setPhrases зовёт первый настоящий ход).
import { ENTER_Y, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { createFillView } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { RISE_DELAY_MS, RISE_MS } from '../player/modules/rotate-phone/wordLaneRise.js'
import { mountMask } from './racePhraseMaskView.js'
import { runDemoScript, heardUpTo } from './racePhraseDemo.js'

export const DEMO_Y = 8            // центр демо-пилюли при выезде, % высоты (верхний край под затемнением — «начинает опускаться»)
export const RISE_WAIT_MS = 600    // заливка доезжает до 100 % перед взлётом не дольше этого
export const AFTER_RISE_MS = 350   // после старта взлёта — до реплики «теперь ты»

/**
 * → { tick(t), stop(), done(), state() }. pool / lane / speed — сцены; kit — голос директора { sayLine, sayText, busyLeft, text(id) }; show(text) — подпись над лентой; snap(el) — щелчок пилюли;
 * onDone() — демо доиграло (сцена переходит к первому ходу); log — журнал «[phrase-demo] …».
 */
export function createDemoTurn({ pool, lane, speed, phrase, kit, show, snap = () => {}, now, onDone, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const view = createFillView()
  const atMs = ((DEMO_Y - ENTER_Y) / (SPEED * speed)) * 1000
  const k = pool.take(lane, { atMs, speed, cap: phrase.text, quiet: true, wide: true })
  let mask = null, leaving = null, goal = 0, shown = 0, lastT = now(), finished = false, risen = false, rising = null, riseAt = 0, t0 = now()
  const timers = []
  if (k != null) {
    pool.attr(k, 'data-mode', 'say'); pool.attr(k, 'data-faded'); pool.attr(k, 'data-demo')
    mask = mountMask(pool.el(k), phrase.text)
  }
  const say = s => { try { log(`[phrase-demo] ${s}`) } catch { /* журнал не мешает демо */ } }
  const y = () => (k == null ? null : pool.y(k))
  const dropMask = ms => { const m = mask; mask = null; leaving = m; if (m) timers.push(setTimer(() => { m.remove(); leaving = null }, ms)) }
  const takeOff = () => {
    const done = rising; rising = null
    if (k != null && !risen) {
      risen = true
      say(`взлёт: y ${Math.round(y() ?? 0)} %, ${Math.round(now() - t0)} мс от начала`)
      pool.attr(k, 'data-lock'); pool.flashLane?.(lane); snap(pool.el(k), lane, { full: true })
      if (pool.rise(k)) dropMask(RISE_DELAY_MS + RISE_MS + 100)
    }
    timers.push(setTimer(done, AFTER_RISE_MS))
  }
  const script = runDemoScript({
    phrase, sayLine: (...a) => kit?.sayLine?.(...a), sayText: (...a) => kit?.sayText?.(...a), busyLeft: () => kit?.busyLeft?.() ?? 0, lineText: id => kit?.text?.(id) ?? '', show,
    open: (i, v) => { mask?.set(heardUpTo(i)); goal = v },
    all: () => { mask?.set(new Map(), true); goal = 1 },
    rise: done => { rising = done; riseAt = now() },
    onStep: (name, info) => { if (name === 'line') say(`реплика ${info.id}${info.said ? '' : ' (подпись, без голоса)'}${y() == null ? '' : `, y ${Math.round(y())} %`}`); if (name === 'word') say(`слово ${info.i + 1} «${info.word}», заливка ${Math.round(info.v * 100)} %`) },
    onDone: () => { finished = true; say(`конец: ${Math.round(now() - t0)} мс`); onDone?.() },
    setTimer, clearTimer,
  })
  return {
    tick(t) {
      const dt = t - lastT; lastT = t
      if (k != null && !risen) { shown = view.step('demo', goal, dt); pool.paintFill(k, shown) }
      if (rising && (k == null || shown >= 0.999 || t - riseAt >= RISE_WAIT_MS)) takeOff()
    },
    stop() { script.stop(); timers.forEach(clearTimer); mask?.remove(); leaving?.remove(); mask = leaving = null },
    done: () => finished,
    state: () => ({ y: y(), fill: shown, step: script.step(), mask: mask?.words() ?? null, risen }),
  }
}
