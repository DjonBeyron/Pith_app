// Демо-ход круга «Скажи» на ЖИВОЙ пилюле (racePhraseScene.js зовёт перед первым ходом; скрипт и ворота — racePhraseDemo.js). Пилюля — из пула сцены, та же, что у настоящих ходов: широкая, data-mode='say',
// бледная (data-faded), маска-кирпичики (mountMask) и data-demo. Выкатывается КАК ОБЫЧНАЯ — из-за верхнего края (замечание владельца 2026-11-09: «появляется просто»), но вплотную к нему (DEMO_ENTER_Y).
// БЕЗ ТИШИНЫ И БЕЗ ОСТАНОВКИ (замечание владельца 2026-11-09, v3.3.174: «Пит молчит и пилюля летит; нужно — как только показалась, Пит начал разбор, она не останавливалась, а Пит вёл разбор, пока пилюля не дошла
// до его головы»): первая реплика — как только пилюля показалась (DEMO_SHOW_Y / DEMO_LINE_MAX_MS), скорость демо-пилюли (она на ленте одна; обычные — по-прежнему SAY_SPEED) = путь до головы Пита / оценка
// разбора (racePhraseDemoPace.js), на каждом шаге скрипта — поправка по факту (длина реплики — busyLeft сразу после sayLine, слова — onSay): pool.retime без скачка. Запас: разбор затянулся сильнее
// нижней границы скорости — у головы пилюля замирает (pool.hold), чтобы не въехать в Пита.
// Заливка — как в игре (замечание владельца 2026-11-08, 3: «демо заливает 25/50/75 %, а надо по границам слов»): цель после слова k — граница
// слова k на пилюле (racePhraseFill.edgeAt по mask.edges(), перемер после смены кирпичика на слово), экран догоняет той же кривой (approachFillFast); перед взлётом доезжает до 100 % (не дольше RISE_WAIT_MS),
// взлёт — pool.rise (как при зачёте: data-lock, вспышка ленты, щелчок). Слушатель фраз на демо-ходу не слушает: у сцены ещё нет кандидатов (setPhrases зовёт первый настоящий ход).
import { ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { createFillView, approachFillFast } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { edgeAt } from './racePhraseFill.js'
import { RISE_DELAY_MS, RISE_MS } from '../player/modules/rotate-phone/wordLaneRise.js'
import { mountMask } from './racePhraseMaskView.js'
import { runDemoScript, heardUpTo, demoPlan } from './racePhraseDemo.js'
import { phraseWords } from './racePhraseData.js'
import { DEMO_ENTER_Y, DEMO_SHOW_Y, DEMO_LINE_MAX_MS, DEMO_RETIME_PCT, HEAD_Y, riseYFor, headTopY, paceSpeed, travelMs, missPct, scriptMs, lineStepMs, wordStepMs, gapsLeft, padFor } from './racePhraseDemoPace.js'

export const RISE_WAIT_MS = 600    // заливка доезжает до 100 % перед взлётом не дольше этого
export const AFTER_RISE_MS = 350   // после старта взлёта — до реплики «теперь ты»
export const HEAD_OVER = 0.5       // запас: центр ниже точки у головы на столько (% высоты), а взлёта нет — пилюля замирает (pool.hold)

const x = v => v.toFixed(2).replace('.', ',')
/** Макушка Пита по сцене пилюли (.wlStage — голова стоит на её дне); без DOM — HEAD_Y */
const headOf = el => { try { const r = el?.closest?.('.wlStage')?.getBoundingClientRect?.(); return r ? headTopY(r, globalThis.innerHeight) : HEAD_Y } catch { return HEAD_Y } }

/**
 * → { tick(t), stop(), done(), state() }. pool / lane — сцены; kit — голос директора { sayLine, sayText, busyLeft, text(id) — подпись неозвученной реплики, hasWord(w), lineMs(id) — мс озвученной реплики (0 — неозвучена),
 * wordMs(w) — мс голоса слова }; show(text) — подпись над лентой; snap(el) — щелчок пилюли; onDone() — демо доиграло (сцена переходит к первому ходу); log — журнал «[phrase-demo] …».
 */
export function createDemoTurn({ pool, lane, phrase, kit, show, snap = () => {}, now, onDone, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const view = createFillView(approachFillFast), list = phraseWords(phrase.text), words = list.length || 1, plan = demoPlan(list.length)
  const est = { lineMs: id => kit?.lineMs?.(id) ?? null, wordMs: w => kit?.wordMs?.(w) ?? 0 }
  const total = scriptMs(plan, 0, list, est) // оценка разбора: от первой реплики до взлёта
  const lead = s => Math.min(DEMO_LINE_MAX_MS, travelMs(DEMO_SHOW_Y - DEMO_ENTER_Y, s)) // выезд → первая реплика
  const speedTo = rise => paceSpeed(rise - DEMO_ENTER_Y, lead(paceSpeed(rise - DEMO_ENTER_Y, DEMO_LINE_MAX_MS + total)) + total)
  let head = HEAD_Y, riseY = riseYFor(head), rate = speedTo(riseY), pad = 0 // pad — добавка к паузам Пита (разбор короче пути)
  const k = pool.take(lane, { atMs: travelMs(DEMO_ENTER_Y - ENTER_Y, rate), speed: rate, cap: phrase.text, quiet: true, wide: true }) // из-за верхнего края, как обычные (вплотную к нему)
  let mask = null, leaving = null, said = 0, shown = 0, lastT = now(), finished = false, risen = false, rising = null, riseAt = 0, t0 = now(), script = null, held = false, off = false
  const timers = []
  if (k != null) {
    pool.attr(k, 'data-mode', 'say'); pool.attr(k, 'data-faded'); pool.attr(k, 'data-demo')
    mask = mountMask(pool.el(k), phrase.text)
    head = headOf(pool.el(k)); riseY = riseYFor(head)
    const s = speedTo(riseY); if (s !== rate && pool.retime?.(k, s)) rate = s // экран не 375×812 — голова выше / ниже: скорость под неё (ещё за краем, скачка нет)
    pad = padFor(riseY - DEMO_ENTER_Y, lead(rate) + total, gapsLeft(plan, 0))
  }
  const say = s => { try { log(`[phrase-demo] ${s}`) } catch { /* журнал не мешает демо */ } }
  const y = () => (k == null ? null : pool.y(k))
  const since = () => Math.round(now() - t0)
  if (k != null) say(`пилюля выезжает из-за края, скорость ×${x(rate)} (оценка разбора ${Math.round(total)} мс, голова Пита y ${Math.round(head)} %, центр пилюли у головы — ${Math.round(riseY)} %)${pad ? `, паузы Пита +${pad} мс` : ''}`)
  /** Шаг скрипта at начался: до взлёта ещё rem мс — скорость так, чтобы прийти к голове ровно к взлёту (в пределах racePhraseDemoPace); не успеть и на верхней — паузы Пита длиннее */
  const pace = (rem, at) => {
    const yy = y()
    if (k == null || risen || held || yy == null) return
    const path = Math.max(0, riseY - yy), want = paceSpeed(path, rem), p = padFor(path, rem, gapsLeft(plan, at))
    if (Math.abs(p - pad) >= 40) say(`паузы Пита +${pad} → +${p} мс (разбор короче пути до головы), y ${Math.round(yy)} %`)
    pad = p
    if (want === rate || missPct(path, rem, rate) < DEMO_RETIME_PCT) return
    const lag = Math.round(rem - travelMs(path, rate)) // > 0 — разбор дольше оценки (пилюля пришла бы раньше), < 0 — быстрее
    if (!pool.retime?.(k, want)) return
    say(`скорость ×${x(rate)} → ×${x(want)} (${lag >= 0 ? 'отстаём' : 'опережаем'} на ${Math.abs(lag)} мс), y ${Math.round(yy)} %`)
    rate = want
  }
  const dropMask = ms => { const m = mask; mask = null; leaving = m; if (m) timers.push(setTimer(() => { m.remove(); leaving = null }, ms)) }
  const takeOff = () => {
    const done = rising; rising = null
    if (k != null && !risen) {
      risen = true
      say(`взлёт: y ${Math.round(y() ?? 0)} % (у головы — ${Math.round(riseY)} %), ${since()} мс от начала`)
      pool.attr(k, 'data-lock'); pool.flashLane?.(lane); snap(pool.el(k), lane, { full: true })
      if (pool.rise(k)) dropMask(RISE_DELAY_MS + RISE_MS + 100)
    }
    timers.push(setTimer(done, AFTER_RISE_MS))
  }
  const goal = () => edgeAt(said, words, mask?.edges() ?? null) // как в игре: граница последнего сказанного слова на пилюле
  const onLine = info => {
    const busy = info.said ? kit?.busyLeft?.() ?? 0 : 0, ms = info.said ? (busy > 0 ? busy : est.lineMs(info.id) || null) : 0 // озвучена: длина — сколько Пит теперь занят
    say(`реплика ${info.id}${ms ? ` (${Math.round(ms)} мс)` : ''}${info.cap ? ' (не озвучена — подпись)' : ''}${info.said ? '' : ' (не сказана)'} через ${since()} мс после выезда${y() == null ? '' : `, y ${Math.round(y())} %`}`)
    pace(lineStepMs(ms) + scriptMs(plan, info.at + 1, list, est), info.at)
  }
  const start = () => runDemoScript({
    phrase, sayLine: (...a) => kit?.sayLine?.(...a), sayText: (...a) => kit?.sayText?.(...a), busyLeft: () => kit?.busyLeft?.() ?? 0, lineText: id => kit?.text?.(id) ?? '', hasWord: w => kit?.hasWord?.(w) ?? true, show,
    open: i => { mask?.set(heardUpTo(i)); said = i + 1 },
    all: () => { mask?.set(new Map(), true); said = Infinity },
    rise: done => { rising = done; riseAt = now() },
    onStep: (name, info) => {
      if (name === 'line') onLine(info)
      if (name === 'word') { say(`слово ${info.i + 1} «${info.word}» (${Math.round(info.ms)}), заливка до границы ${goal().toFixed(2).replace('.', ',')}${y() == null ? '' : `, y ${Math.round(y())} %`}`); pace(wordStepMs(info.ms, plan[info.at + 1]) + scriptMs(plan, info.at + 1, list, est), info.at) }
      if (name === 'mute') { try { log(`[demo] слово «${info.word}» без озвучки — дальше по таймеру`) } catch { /* журнал не мешает демо */ } }
    },
    onDone: () => { finished = true; say(`конец: ${since()} мс`); onDone?.() },
    pad: () => pad,
    setTimer, clearTimer,
  })
  return {
    tick(t) {
      const dt = t - lastT; lastT = t
      if (!script && !off && (k == null || (y() ?? Infinity) >= DEMO_SHOW_Y || t - t0 >= DEMO_LINE_MAX_MS)) script = start() // пилюля показалась — Пит сразу начинает
      if (k != null && !risen && !held && !rising && (y() ?? -Infinity) >= riseY + HEAD_OVER && pool.hold?.(k, true)) { held = true; say(`пилюля у головы Пита: y ${Math.round(y())} % — ждёт конца примера (разбор затянулся), ${since()} мс от начала`) }
      if (k != null && !risen) { shown = view.step('demo', goal(), dt); pool.paintFill(k, shown) }
      if (rising && (k == null || shown >= 0.999 || t - riseAt >= RISE_WAIT_MS)) takeOff()
    },
    stop() { off = true; script?.stop(); timers.forEach(clearTimer); mask?.remove(); leaving?.remove(); mask = leaving = null },
    done: () => finished,
    state: () => ({ y: y(), fill: shown, step: script?.step() ?? null, mask: mask?.words() ?? null, risen, speed: rate, riseY, held }),
  }
}
