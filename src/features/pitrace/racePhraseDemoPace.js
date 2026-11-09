// Темп демо-пилюли «Скажи» (racePhraseDemoTurn.js; замечание владельца 2026-11-09: «Пит молчит, пилюля летит — а нужно, как только она показалась, Пит начал разбор; чтобы она не останавливалась,
// а Пит вёл разбор, пока пилюля не дошла до его головы; можно отрегулировать скорость, чтобы Пит успел»). Пилюля выезжает из-за самого края (DEMO_ENTER_Y: целиком за кадром, низ в 0,5 % над краем),
// первая реплика — как только она показалась (центр DEMO_SHOW_Y — видна нижняя половина, или не позже DEMO_LINE_MAX_MS). Скорость демо-пилюли (одна на ленте) = путь до головы Пита / оценка разбора:
// к взлёту (последнее слово сказано, заливка 100 %) центр пилюли — у головы (riseY: низ пилюли с кольцом касается кончиков ушей), но не ниже. Оценка — по шагам скрипта (racePhraseDemo.demoPlan):
// длины реплик и слов (kit.lineMs / kit.wordMs — настройки и библиотека; нет — DEMO_LINE_EST_MS / DEMO_WORD_MS) и паузы скрипта. Разбор короче пути даже на DEMO_SPEED_MAX — паузы Пита растягиваются (padFor).
// Чистые функции — без DOM (кроме headTopY: прямоугольник сцены аргументом).
import { SPEED, WIDE_H } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { DEMO_LINE_GAP_MS, DEMO_WORD_GAP_MS, DEMO_RUN_GAP_MS, DEMO_WORD_MS, DEMO_POLL_MS, LINE_SILENT_MS } from './racePhraseDemo.js'

export const DEMO_ENTER_Y = -WIDE_H / 2 - 0.5 // выезд: центр пилюли, % высоты (широкая пилюля целиком за верхним краем, вплотную к нему — показывается сразу, без пустого пути)
export const DEMO_SHOW_Y = 0                  // «показалась»: видна нижняя половина пилюли — первая реплика
export const DEMO_LINE_MAX_MS = 600           // …но не позже стольких мс после выезда (медленная пилюля)
export const HEAD_Y = 82                      // макушка Пита (кончики ушей), % высоты — замер на 375×812 (голова .wlCat: min(50 %, 200px), aspect 174/148, сдвиг 4 %); без сцены (тесты) — это число
export const HEAD_TOP_K = 0.904               // макушка над низом сцены, доля высоты головы .wlCat (уши на 5,6 % от верха элемента, 4 % — под краем)
export const RISE_GAP = 0.6                   // внешнее кольцо пилюли выступает за её прямоугольник на столько (% высоты)
export const DEMO_SPEED_MIN = 0.2             // скорость демо-пилюли — во сколько раз быстрее конвейера: не медленнее (не «ползёт»)…
export const DEMO_SPEED_MAX = 0.6             // …и не быстрее
export const DEMO_LINE_EST_MS = 1300          // реплика, длина которой неизвестна (нет kit.lineMs): оценка по журналу владельца (1,1–1,5 с)
export const DEMO_FILL_TAIL_MS = 30           // после последнего слова до взлёта: заливка уже доехала за время голоса слова (журнал владельца — 7 мс)
export const DEMO_RETIME_PCT = 1.5            // на старой скорости пилюля пришла бы к взлёту мимо головы меньше чем на столько (% высоты) — полёт не трогаем (без рывков скорости в конце)
export const DEMO_PAD_MAX_MS = 800            // разбор короче пути даже на DEMO_SPEED_MAX (реплики короткие / не озвучены): паузы Пита растягиваются, но каждая — не больше чем на столько

/** Где центр пилюли у головы: низ пилюли с кольцом — на макушке head (% высоты) */
export const riseYFor = head => +(head - WIDE_H / 2 - RISE_GAP).toFixed(1)
export const DEMO_RISE_Y = riseYFor(HEAD_Y)

/** Макушка Пита, % высоты окна vh: голова стоит на дне сцены stage ({ width, bottom }, px). Нелепое число (нет сцены, нулевой размер) — HEAD_Y */
export function headTopY(stage, vh) {
  const w = Math.min((Number(stage?.width) || 0) / 2, 200), h = (w * 148) / 174
  const y = vh > 0 ? ((Number(stage?.bottom) - HEAD_TOP_K * h) / vh) * 100 : NaN
  return Number.isFinite(y) && y >= 65 && y <= 95 ? +y.toFixed(1) : HEAD_Y
}

/** Скорость пилюли (доля конвейера), чтобы пройти path (% высоты) за ms; в пределах [DEMO_SPEED_MIN, DEMO_SPEED_MAX] */
export function paceSpeed(path, ms) {
  const k = ms > 0 ? path / ((SPEED * ms) / 1000) : DEMO_SPEED_MAX
  return +Math.min(DEMO_SPEED_MAX, Math.max(DEMO_SPEED_MIN, k)).toFixed(3)
}

/** Сколько мс пилюля проходит path (% высоты) со скоростью speed */
export const travelMs = (path, speed) => (path / (SPEED * speed)) * 1000
/** Насколько (% высоты) пилюля со скоростью speed разминётся с головой через rem мс: путь path */
export const missPct = (path, rem, speed) => Math.abs(path - (SPEED * speed * rem) / 1000)

/** Пауза скрипта после слова: дальше слово подряд — DEMO_RUN_GAP_MS, дальше «вся фраза» — сразу, иначе (реплика) — DEMO_WORD_GAP_MS (как runDemoScript) */
export const wordGap = following => (following?.word != null ? DEMO_RUN_GAP_MS : following?.all ? 0 : DEMO_WORD_GAP_MS)

/** Длина реплики-шага скрипта: озвученная (ms > 0) — голос + опрос «Пит договорил?» (в среднем полшага) + пауза до слова, неозвученная (0) — подпись LINE_SILENT_MS; неизвестна (null) — DEMO_LINE_EST_MS */
export const lineStepMs = ms => (ms === 0 ? LINE_SILENT_MS : (ms ?? DEMO_LINE_EST_MS) + DEMO_POLL_MS / 2 + DEMO_LINE_GAP_MS)
/** Длина слова-шага: голос (нет — DEMO_WORD_MS) + пауза за ним */
export const wordStepMs = (ms, following) => (ms > 0 ? ms : DEMO_WORD_MS) + wordGap(following)

/**
 * Оценка скрипта от шага from (включительно) до взлёта, мс: plan — racePhraseDemo.demoPlan, words — слова фразы; lineMs(id) → мс озвученной реплики, 0 — неозвучена, null — неизвестно;
 * wordMs(word) → мс голоса слова (0 / null — DEMO_WORD_MS). Шаги «вся фраза» и «взлёт» — DEMO_FILL_TAIL_MS
 */
export function scriptMs(plan, from, words, { lineMs = () => null, wordMs = () => 0 } = {}) {
  let ms = 0
  for (let i = Math.max(0, from); i < plan.length; i++) {
    const s = plan[i]
    if (s.rise) return ms + DEMO_FILL_TAIL_MS
    if (s.line) ms += lineStepMs(lineMs(s.line))
    else if (s.word != null) ms += wordStepMs(wordMs(words[s.word]), plan[i + 1])
  }
  return ms
}

/** Сколько пауз скрипта (после реплики или слова) осталось от шага from до последнего слова — их можно растянуть (после последнего слова — сразу 100 % и взлёт) */
export function gapsLeft(plan, from) {
  let n = 0
  for (let i = Math.max(0, from); i < plan.length && !plan[i].all && !plan[i].rise; i++) if (plan[i].line || !plan[i + 1]?.all) n++
  return n
}

/** Разбор (rem мс) короче пути path даже на DEMO_SPEED_MAX: добавка к каждой из gaps пауз, мс (0 — успевает и так) */
export function padFor(path, rem, gaps) {
  const short = travelMs(path, DEMO_SPEED_MAX) - rem
  return short > 0 && gaps > 0 ? Math.min(DEMO_PAD_MAX_MS, Math.round(short / gaps)) : 0
}
