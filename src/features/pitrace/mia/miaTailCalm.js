// Хвост Мии: «затихает» и «снова дёргает» (владелец v3.3.328: «хвост останавливается, будто перестала им дёргать, потом снова; с замедлением; не резко на первом кадре — по порядку дойти до 1 и остановиться»).
// Чистые функции без DOM (проверяются тестами): расписание кадров. Кадры идут ТОЛЬКО по порядку цикла (… 8, 9, 1), каждый следующий держится дольше прошлого, последний — кадр 1 (индекс 0, без штрихов) — и остаётся.
// Запуск обратно — с кадра 2 (индекс 1), выдержка укорачивается до обычной (TAIL_MS), дальше цикл подхватывает CSS (race-mia.css, --tail-from).
export const TAIL_FRAMES = 9
export const TAIL_MS = 90 // как --tail-ms в race-mia.css
export const REST_FRAME = 0 // кадр 1: хвост лежит, штрихов нет
export const SLOW_TO_MS = 520 // выдержка последнего шага перед остановкой / первого после неё
export const MIN_STEPS = 5 // не меньше стольких шагов замедления (если кадр 1 ближе — делаем лишний круг, а не обрываем)
export const WAKE_STEPS = 6 // шагов разгона после покоя

const geo = (from, to, i, n) => Math.round(from * (to / from) ** (n <= 1 ? 1 : i / (n - 1))) // выдержка i-го из n шагов от from до to

/** Расписание остановки от кадра cur: [{ f, ms }] — кадры по порядку цикла, выдержка растёт; последний шаг — REST_FRAME (держится, ms = 0) */
export function calmSteps(cur) {
  let n = (REST_FRAME - cur + TAIL_FRAMES) % TAIL_FRAMES
  while (n < MIN_STEPS) n += TAIL_FRAMES
  const out = []
  for (let i = 1; i <= n; i++) out.push({ f: (cur + i) % TAIL_FRAMES, ms: i === n ? 0 : geo(TAIL_MS * 1.4, SLOW_TO_MS, i - 1, n - 1) })
  return out
}

/** Расписание разгона из покоя: кадры 2, 3, … по порядку, выдержка падает от SLOW_TO_MS до TAIL_MS; next — кадр, с которого дальше крутит CSS */
export function wakeSteps() {
  const steps = []
  for (let i = 1; i <= WAKE_STEPS; i++) steps.push({ f: (REST_FRAME + i) % TAIL_FRAMES, ms: geo(SLOW_TO_MS, TAIL_MS, i - 1, WAKE_STEPS) })
  return { steps, next: (REST_FRAME + WAKE_STEPS + 1) % TAIL_FRAMES }
}
