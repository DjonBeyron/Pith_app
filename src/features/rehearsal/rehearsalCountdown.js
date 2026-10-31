// Отсчёт тремя нотами в «Репетиции» (решение владельца): как перед стартом в гонках — три коротких ноты до — ми — соль с паузой COUNT_STEP_MS. Два места: перед разминкой (после реплики Пита «давай разомнёмся…», до первого слова)
// и перед дублем (после плашки «Дубль», до реплики «поехали» и записи). Здесь только чистый план и раскладка по времени (без звука и React); звук — rehearsalCountdownSound.js, запуск и ожидание конца отсчёта стадией — rehearsalCountdownRun.js (из useRehearsalActs.js).
// В стадии announce (rehearsalStages.js) это поле count: 'after' — отсчёт ПОСЛЕ реплики стадии (разминка), 'before' — ДО реплики (дубль: «Дубль» → ноты → «поехали»). Отсчёт не зависит от режима «тап вместо речи», от выбранного звука и громкости награды (мяу / ноты / ползунок) и от «полной тишины приложения» вкладки «Голос».
export const COUNT_FREQS = [523.25, 659.25, 783.99] // C5 — E5 — G5, те же высоты, что у «лесенки нот» награды (wordLaneNotes.js)
export const COUNT_STEP_MS = 500   // между началами нот
export const COUNT_NOTE_MS = 240   // длина одной ноты (короткая, отрывистая)
export const COUNT_TAIL_MS = 350   // тишина после последней ноты, прежде чем идти дальше
export const COUNT_LEVELS = [1, 1, 1.2] // последняя (сигнал «старт») чуть громче; громкость — GainNode с фиксированной величиной (rehearsalCountdownSound.COUNT_GAIN), уровень RMS — rehearsalCountdownSynth.js

/** План отсчёта: [{ k, freq, at (мс от начала отсчёта), ms, level }] — три ноты */
export const countdownPlan = ({ step = COUNT_STEP_MS, ms = COUNT_NOTE_MS } = {}) => COUNT_FREQS.map((freq, k) => ({ k, freq, at: k * step, ms, level: COUNT_LEVELS[k] ?? 1 }))

/** Сколько длится отсчёт целиком: от первой ноты до конца хвоста после последней */
export function countdownMs(plan = countdownPlan(), tail = COUNT_TAIL_MS) {
  const last = plan[plan.length - 1]
  return last ? last.at + last.ms + tail : 0
}

export const QUIET_RISE_MS = 260 // то же, что CAT_RISE_MS (wordLaneCatSay.js): звук реплики начинается позже на выскакивание головы Пита

/**
 * Раскладка стадии со счётом по времени (мс от начала стадии): lineAt — когда Пит начинает реплику, countAt — когда первая нота, holdMs — сколько держать плашку.
 *  order 'after': реплика, потом отсчёт (разминка); 'before': отсчёт, потом реплика (дубль); не задан — только реплика (как раньше).
 *  lead — задержка плашки перед первым звуком, busyMs — сколько Пит ещё договаривает прошлую реплику, lineMs — длина реплики, pause — тишина после неё (микрофон «не слушает»), minMs — стадия не короче.
 *  quiet — реплика озвучена и пока Пит говорит, плашки на экране нет (rehearsalQuiet.js): плашка выходит ПОСЛЕ реплики, поэтому стадия держится ещё minMs после её конца (rise — пока голова Пита выскакивает).
 */
export function stageTiming({ order = null, lead = 250, busyMs = 0, lineMs = 0, pause = 600, minMs = 0, hasLine = true, quiet = false, plan = countdownPlan() } = {}) {
  const start = lead + Math.max(0, busyMs)
  const lineLen = hasLine ? lineMs + pause : 0
  const count = order ? countdownMs(plan) : 0
  const shown = hasLine && quiet ? minMs : 0 // плашка после речи Пита: ещё minMs от конца реплики (у отсчёта «до» плашка идёт ДО реплики и после неё не возвращается)
  const spoken = at => at + QUIET_RISE_MS + lineMs + shown // конец реплики + показ плашки
  if (order === 'before') return { countAt: start, lineAt: hasLine ? start + count : null, holdMs: Math.max(minMs, start + count + lineLen) }
  if (order === 'after') { const lineAt = start + (hasLine ? 20 : 0); return { countAt: lineAt + lineLen, lineAt: hasLine ? lineAt : null, holdMs: Math.max(minMs, lineAt + lineLen + count, quiet && hasLine ? spoken(lineAt) : 0) } }
  const lineAt = hasLine ? start + 20 : null
  return { countAt: null, lineAt, holdMs: Math.max(minMs, start + lineLen, quiet && hasLine ? spoken(lineAt) : 0) }
}
