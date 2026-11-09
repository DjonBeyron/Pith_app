// Демо-ход круга «Скажи» на ЖИВОЙ пилюле (racePhraseScene.js зовёт перед первым ходом; скрипт и ворота — racePhraseDemo.js). Пилюля — из пула сцены, та же, что у настоящих ходов: широкая, data-mode='say',
// бледная (data-faded), маска-кирпичики (mountMask) и data-demo; скорость — круга (SAY_SPEED, одна на ленте). Выкатывается КАК ОБЫЧНАЯ — из-за верхнего края (ENTER_Y, atMs 0; замечание владельца 2026-11-09:
// «пилюля-пример не выкатывается, как обычные, а появляется просто» — раньше стартовала сразу с центром на 8 %), а первая реплика Пита — когда пилюля уже видна целиком (центр DEMO_LINE_Y = ZONE_TOP_Y, как ранние ходы).
// Пример длиннее пути (реплики озвучены: ≈ 9 с у владельца, а от 22 до 60 % — ≈ 4 с) — пилюля замирает на DEMO_HOLD_Y (pool.hold, как продление хода у края) и ждёт взлёта: взлёт не ниже 60 %, не под кнопками.
// Заливка — как в игре (замечание владельца 2026-11-08, 3: «демо заливает 25/50/75 %, а надо по границам слов»): цель после слова k — граница
// слова k на пилюле (racePhraseFill.edgeAt по mask.edges(), перемер после смены кирпичика на слово), экран догоняет той же кривой (approachFillFast); перед взлётом доезжает до 100 % (не дольше RISE_WAIT_MS),
// взлёт — pool.rise (как при зачёте: data-lock, вспышка ленты, щелчок). Слушатель фраз на демо-ходу не слушает: у сцены ещё нет кандидатов (setPhrases зовёт первый настоящий ход).
import { ENTER_Y, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { createFillView, approachFillFast } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { edgeAt } from './racePhraseFill.js'
import { RISE_DELAY_MS, RISE_MS } from '../player/modules/rotate-phone/wordLaneRise.js'
import { mountMask } from './racePhraseMaskView.js'
import { runDemoScript, heardUpTo } from './racePhraseDemo.js'
import { phraseWords } from './racePhraseData.js'
import { ZONE_TOP_Y } from './racePhraseEarly.js'

export const DEMO_LINE_Y = ZONE_TOP_Y // первая реплика — когда центр пилюли здесь, % высоты (верх широкой пилюли на 16,5 % — ниже затемнения: видна целиком)
export const DEMO_HOLD_Y = 60       // ниже центр не уезжает: пример ещё идёт — пилюля замирает здесь до взлёта (низ на 65,5 %, выше нижнего затемнения 72 %)
export const RISE_WAIT_MS = 600    // заливка доезжает до 100 % перед взлётом не дольше этого
export const AFTER_RISE_MS = 350   // после старта взлёта — до реплики «теперь ты»

/**
 * → { tick(t), stop(), done(), state() }. pool / lane / speed — сцены; kit — голос директора { sayLine, sayText, busyLeft, text(id) — подпись неозвученной реплики, hasWord(w) }; show(text) — подпись над лентой; snap(el) — щелчок пилюли;
 * onDone() — демо доиграло (сцена переходит к первому ходу); log — журнал «[phrase-demo] …».
 */
export function createDemoTurn({ pool, lane, speed, phrase, kit, show, snap = () => {}, now, onDone, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const view = createFillView(approachFillFast), words = phraseWords(phrase.text).length || 1
  const k = pool.take(lane, { atMs: 0, speed, cap: phrase.text, quiet: true, wide: true }) // из-за верхнего края, как обычные
  let mask = null, leaving = null, said = 0, shown = 0, lastT = now(), finished = false, risen = false, rising = null, riseAt = 0, t0 = now(), script = null, held = false, off = false
  const timers = []
  if (k != null) {
    pool.attr(k, 'data-mode', 'say'); pool.attr(k, 'data-faded'); pool.attr(k, 'data-demo')
    mask = mountMask(pool.el(k), phrase.text)
  }
  const say = s => { try { log(`[phrase-demo] ${s}`) } catch { /* журнал не мешает демо */ } }
  const y = () => (k == null ? null : pool.y(k))
  if (k != null) say(`пилюля выезжает из-за края, первая реплика через ${Math.round(((DEMO_LINE_Y - ENTER_Y) / (SPEED * speed)) * 1000)} мс (y ${DEMO_LINE_Y} %)`)
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
  const goal = () => edgeAt(said, words, mask?.edges() ?? null) // как в игре: граница последнего сказанного слова на пилюле
  const start = () => runDemoScript({
    phrase, sayLine: (...a) => kit?.sayLine?.(...a), sayText: (...a) => kit?.sayText?.(...a), busyLeft: () => kit?.busyLeft?.() ?? 0, lineText: id => kit?.text?.(id) ?? '', hasWord: w => kit?.hasWord?.(w) ?? true, show,
    open: i => { mask?.set(heardUpTo(i)); said = i + 1 },
    all: () => { mask?.set(new Map(), true); said = Infinity },
    rise: done => { rising = done; riseAt = now() },
    onStep: (name, info) => {
      if (name === 'line') say(`реплика ${info.id}${info.cap ? ' (не озвучена — подпись)' : ''}${info.said ? '' : ' (не сказана)'}${y() == null ? '' : `, y ${Math.round(y())} %`}`)
      if (name === 'word') say(`слово ${info.i + 1} «${info.word}», заливка до границы ${goal().toFixed(2).replace('.', ',')}`)
      if (name === 'mute') { try { log(`[demo] слово «${info.word}» без озвучки — дальше по таймеру`) } catch { /* журнал не мешает демо */ } }
    },
    onDone: () => { finished = true; say(`конец: ${Math.round(now() - t0)} мс`); onDone?.() },
    setTimer, clearTimer,
  })
  return {
    tick(t) {
      const dt = t - lastT; lastT = t
      if (!script && !off && (k == null || (y() ?? Infinity) >= DEMO_LINE_Y)) script = start() // пилюля видна целиком — Пит начинает
      if (k != null && !risen && !held && (y() ?? -Infinity) >= DEMO_HOLD_Y && pool.hold?.(k, true)) { held = true; say(`пилюля ждёт конца примера: y ${Math.round(y())} %, ${Math.round(now() - t0)} мс от начала`) }
      if (k != null && !risen) { shown = view.step('demo', goal(), dt); pool.paintFill(k, shown) }
      if (rising && (k == null || shown >= 0.999 || t - riseAt >= RISE_WAIT_MS)) takeOff()
    },
    stop() { off = true; script?.stop(); timers.forEach(clearTimer); mask?.remove(); leaving?.remove(); mask = leaving = null },
    done: () => finished,
    state: () => ({ y: y(), fill: shown, step: script?.step() ?? null, mask: mask?.words() ?? null, risen }),
  }
}
