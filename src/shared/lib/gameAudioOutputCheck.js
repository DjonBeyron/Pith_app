// Проверка вывода после обновления аудиосессии (gameAudioRenew.js) при старте игры: идёт ли рендер у ПЕРВОЙ реплики. Услышит ли человек звук, JS не знает, но прогресс контекста виден:
// через min(CHECK_MS, длина + ENDED_SLACK_MS) после source.start время контекста (currentTime) должно сдвинуться, а короткая реплика — успеть доиграть (ended). Нет — «[audio] звук не пошёл — повторяю
// обновление сессии»: ОДИН автоматический повтор renew и перезапуск этой реплики в новом контексте. Пока слушает микрофон (живой контекст захвата Vosk) — не повторяем: закрытие оборвало бы распознавание,
// поможет «Продолжить» (v3.3.165: оставленный между ходами контекст захвата без слушателя не считается — voskCapture.busyCaptures). Звук так и не стартовал за WATCH_MS — наблюдение снимается. Зависимости подставляются (тесты).
import { watchNextStart } from './gameBufferPlay.js'
import { busyCaptures } from './vosk/voskCapture.js'
import { pLog } from './debug.js'

export const CHECK_MS = 1500       // сколько после source.start ждём движения времени контекста
export const ENDED_SLACK_MS = 300  // запас к длине реплики, за который должен прийти ended
export const WATCH_MS = 20000      // первая реплика не стартовала за это время — проверку снимаем

/** Проверить вывод у следующего стартовавшего звука игры; renew() — повтор обновления сессии (→ промис). → отмена */
export function armOutputCheck({ renew, watch = watchNextStart, live = busyCaptures, log = pLog, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let checkTimer = 0
  const off = watch(info => {
    clearTimer(expire)
    const wait = Math.min(CHECK_MS, (info.durMs || 0) + ENDED_SLACK_MS)
    checkTimer = setTimer(() => {
      checkTimer = 0
      const moved = (Number(info.ctx?.currentTime) || 0) - info.t0
      const endedLate = (info.durMs || 0) + ENDED_SLACK_MS <= CHECK_MS && !info.ended()
      if (moved > 0 && !endedLate) { log(`[audio] проверка вывода: первая реплика идёт — время ctx +${moved.toFixed(2)} с за ${wait} мс (${info.ctx?.state ?? '—'})`); return }
      const why = moved > 0 ? `ended не пришёл за ${wait} мс` : `время ctx стоит ${wait} мс (${info.ctx?.state ?? '—'})`
      if (live().some(r => r.kind === 'capture')) { log(`[audio] звук не пошёл (${why}), но микрофон уже слушает — обновление сессии не повторяю (поможет «Продолжить»)`); return }
      log(`[audio] звук не пошёл (${why}) — повторяю обновление сессии`)
      Promise.resolve().then(renew).catch(() => null).then(r => { log(`[audio] повтор обновления: ctx ${r?.state ?? '—'} — перезапускаю реплику`); info.replay() })
    }, wait)
  })
  const expire = setTimer(() => { off(); log(`[audio] проверка вывода снята: звук не стартовал за ${WATCH_MS / 1000} с`) }, WATCH_MS)
  return () => { off(); clearTimer(expire); if (checkTimer) clearTimer(checkTimer) }
}
