// Хронология старта «Встряхни память» одной группой «[start]» — миллисекунды от тапа «Начать» (владелец: «почему Пит всё же молчит некоторое время; хочу: сразу выскакивает снизу Пит и сразу говорит»).
// Шаги отмечают те, кто их делает: тап «Начать» (useRaceLaunch.open), AudioContext и декодирование (raceWarm.js), тап «Говорю / Тапаю», вход в игру, Пит и голос (raceStartTrace.js), getUserMedia,
// «Готовлю звук» и ворота (wordLaneStart.js), сцена и первый кадр (useRaceLaunch), sayLine и конец первой реплики (useCatLines.js), конвейер (useLaneConveyor.js). Каждый шаг пишется один раз за запуск.
// Когда голос Пита начался — строка-итог: «[start] итог: от входа в игру до голоса M мс (цель ≤ 400), от тапа «Говорю» до голоса N мс; самый долгий шаг — …» (пометка «ДОЛЬШЕ», если M > 400).
// Строки идут через pLog — в журнал игры (gameJournal.js, «Скачать журнал» в шестерёнке). Хронология живёт CHRON_WINDOW_MS после тапа: позже шаги не пишутся (игра уже идёт). Чистая логика: часы и журнал — аргументами.
import { pLog } from '../../shared/lib/debug.js'

export const CHRON_WINDOW_MS = 20000 // столько мс после тапа «Начать» шаги ещё пишутся (попап + старт игры)
export const START_VOICE_MS = 400    // цель: голос Пита не позже стольки мс после входа в игру (= raceStartTrace.RACE_ENTRY_LINE_MS)

const CHOICE = { voice: 'Говорю', tap: 'Тапаю' }

/** Самый долгий промежуток между соседними шагами, начиная с шага from: → { label, ms, prev } или null */
export function longestStep(steps, from = 'ask') {
  const i0 = Math.max(0, steps.findIndex(s => s.name === from))
  let best = null
  for (let i = i0 + 1; i < steps.length; i++) {
    const ms = steps[i].at - steps[i - 1].at
    if (!best || ms > best.ms) best = { label: steps[i].label, prev: steps[i - 1].label, ms }
  }
  return best
}

export function createStartChron({ now = () => performance.now(), log = pLog } = {}) {
  let t0 = null, steps = [], seen = new Set(), done = false, picked = null
  const say = text => { try { log(text) } catch { /* журнал не мешает игре */ } }
  const at = name => steps.find(s => s.name === name)?.at ?? null
  const api = {
    /** Тап «Начать»: отсчёт с нуля */
    tap() {
      t0 = now(); steps = [{ name: 'tap', label: 'тап «Начать»', at: 0 }]; seen = new Set(['tap']); done = false; picked = null
      say('[start] +0 мс тап «Начать» (жест): сцена с попапом, тихий прогрев')
    },
    /** Идёт ли запуск (тап был не дольше CHRON_WINDOW_MS назад) */
    active: () => t0 != null && now() - t0 <= CHRON_WINDOW_MS,
    /** Шаг name (один раз за запуск): строка «[start] +N мс label». → N или null (не пишем) */
    step(name, label) {
      if (!api.active() || seen.has(name)) return null
      seen.add(name)
      const ms = Math.round(now() - t0)
      steps.push({ name, label, at: ms })
      say(`[start] +${ms} мс ${label}`)
      return ms
    },
    /** Тап по «Говорю» / «Тапаю» */
    ask(choice) { // повторный ответ (микрофон не дали → «Тапаю»): шаги прошлой попытки стираются, отсчёт от тапа «Начать» сохраняется
      const prev = at('ask')
      if (prev != null) { steps = steps.filter(s => s.at < prev); seen = new Set(steps.map(s => s.name)); done = false }
      picked = CHOICE[choice] ?? String(choice); api.step('ask', `тап «${picked}»`)
    },
    /** Голос Пита начался (voiced: false — первая реплика без звука, только подпись): шаг и итог. → итог { entry, ask, longest } или null */
    voice({ voiced = true, id = null } = {}) {
      if (done || api.step('voice', voiced ? `голос Пита: источник звука стартовал${id ? ` («${id}»)` : ''}` : `первая реплика БЕЗ звука${id ? ` («${id}»)` : ''} — только подпись`) == null) return null
      done = true
      const v = at('voice'), e = at('enter'), a = at('ask')
      const r = { entry: e == null ? null : v - e, ask: a == null ? null : v - a, longest: longestStep(steps) }
      const slow = r.entry != null && r.entry > START_VOICE_MS
      const parts = [`от входа в игру до голоса Пита ${r.entry ?? '—'} мс (цель ≤ ${START_VOICE_MS})`, `от тапа «${picked ?? 'Говорю / Тапаю'}» до голоса ${r.ask ?? '—'} мс`]
      const top = r.longest ? `; самый долгий шаг — «${r.longest.label}» (${r.longest.ms} мс после «${r.longest.prev}»)` : ''
      say(`[start] итог: ${parts.join(', ')}${top}${slow ? ' — ДОЛЬШЕ' : ''}${voiced ? '' : ' (без звука)'}`)
      return r
    },
    /** Запуск отменён (крестик попапа, конец игры): дальше молчим до следующего «Начать» */
    cancel() { t0 = null },
    steps: () => steps.slice(),
  }
  return api
}

/** Общий экземпляр страницы */
export const raceChron = createStartChron()
