import { fillLine } from './rehearsalLines.js'
import { LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { LINE_WAIT_MS } from '../player/modules/rotate-phone/wordLaneLineGate.js'

// «Тишина экрана», пока Пит говорит (решение владельца, v3.3.84): на старте стадии (announce с line, mirror, итог) во время его реплики на экране только дорожки и сам кот; плашка акта, подписи, перевод, ярлыки, экран зеркала
// и итога выходят ПОСЛЕ конца реплики. Здесь чистые решения (без React): есть ли что ждать, когда реплика кончилась. Хук состояния — usePitQuiet.js, подключение — useRehearsalActs.js (rh.quiet / rh.plateOk).
//  • ждём только ОЗВУЧЕННУЮ реплику (есть url озвучки): без озвучки Пит молчит, подпись и так видна, ждать нечего — «сразу»;
//  • конец реплики узнаём по занятости кота (busyLeft = конец речи + LINE_PAUSE_MS паузы): когда осталась одна пауза, речь кончилась. Раньше lineAt + QUIET_GRACE_MS не смотрим (реплика ещё не началась — busyLeft от прошлой);
//    реплика может ждать слот озвучки до LINE_WAIT_MS — это время входит в предел; предел нужен, чтобы экран не остался пустым навсегда;
//  • стадия с отсчётом «до» (дубль): плашка «Дубль» и три ноты идут ДО реплики «поехали» — тишина включается в момент реплики (from = lineAt), а когда реплика кончилась, плашка уже не возвращается (plateOk).
export const QUIET_GRACE_MS = 120   // реплика сказана по таймеру lineAt: через столько мс её занятость уже выставлена
export const QUIET_POLL_MS = 60
export const QUIET_TAIL_MS = 1500   // запас предела сверх ожидания слота и длины реплики

/** Озвучена ли реплика id (есть озвучка в настройках): только такую ждём */
export const lineVoiced = (lines, id) => !!(id && fillLine(lines?.[id])?.url)

/** Описание тихого окна стадии: lineAt — когда Пит начинает (мс от старта стадии), from — когда экран гаснет (0, у отсчёта «до» — lineAt), cap — предел ожидания. null — ждать нечего (нет реплики / не озвучена) */
export function quietSpec({ voiced, order = null, lineAt = 0, lineMs = 0 }) {
  if (!voiced || lineAt == null) return null
  return { lineAt, from: order === 'before' ? lineAt : 0, cap: lineAt + LINE_WAIT_MS + lineMs + QUIET_TAIL_MS }
}

/** Реплика кончилась? elapsed — мс от старта стадии, busyLeft — сколько ещё кот занят (речь + пауза) */
export const quietDone = (spec, elapsed, busyLeft) => elapsed >= spec.cap || (elapsed >= spec.lineAt + QUIET_GRACE_MS && busyLeft <= LINE_PAUSE_MS)

/**
 * Экран «тихий» сейчас? Состояние: key — какая стадия (null — нет реплики, ждать нечего), armed — для отсчёта «до»: ключ, у которого реплика уже началась, ended — ключ, у которого реплика кончилась.
 * → { quiet (прятать плашку, подписи, перевод, экраны), plateOk (плашка может быть на экране) }
 */
export function quietState({ key, voiced, order = null, armed = null, ended = null }) {
  if (!key || !voiced) return { quiet: false, plateOk: true }
  const done = ended === key
  const quiet = !done && (order !== 'before' || armed === key)
  return { quiet, plateOk: !quiet && !(order === 'before' && done) }
}
