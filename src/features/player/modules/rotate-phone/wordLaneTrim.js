// Где в записи слова на самом деле звучит голос. Озвучка (ElevenLabs и др.) часто несёт «хвост»: тишину, вдох или затухание до/после слова, а длина файла в библиотеке — вместе с ним.
// Заливка пилюли диктора идёт по длине слова, поэтому с хвостом она дотягивалась до конца файла и расходилась с голосом («trying» — пилюля полна, а слово давно кончилось).
// speechBounds находит начало и конец голоса по громкости кадров; по ним игра считает длину слова (без хвоста) и сдвигает старт звука на начало голоса. Чистые функции — проверяются тестами.
export const FRAME_S = 0.01     // кадр анализа, с
export const REL_THRESHOLD = 0.1 // голос — кадры громче 10 % от самого громкого кадра записи (≈ −20 дБ): дыхание и шум фона ниже
export const ABS_FLOOR = 0.004   // и не тише этого (RMS 0…1): в почти пустой записи шум голосом не считается
export const PAD_START_S = 0.02  // запас перед первым громким кадром (согласные начинаются тише)
export const PAD_END_S = 0.04    // и после последнего (затухание звука)

/** RMS по кадрам FRAME_S для samples (моно) в [from, to) секунд */
function frames(samples, rate, from, to) {
  const size = Math.max(1, Math.round(FRAME_S * rate))
  const a = Math.max(0, Math.floor(from * rate))
  const b = Math.min(samples.length, Math.ceil(to * rate))
  const out = []
  for (let i = a; i + size <= b; i += size) {
    let sum = 0
    for (let j = i; j < i + size; j++) sum += samples[j] * samples[j]
    out.push(Math.sqrt(sum / size))
  }
  return { out, a: a / rate }
}

/**
 * Границы голоса в samples (моно, частота rate) внутри окна [from, to) секунд (по умолчанию — вся запись): { start, end } в секундах от начала ЗАПИСИ.
 * Тишина или слишком короткое окно — окно целиком (ничего не обрезаем).
 */
export function speechBounds(samples, rate, from = 0, to = samples.length / rate) {
  const { out, a } = frames(samples, rate, from, to)
  const peak = out.reduce((m, v) => Math.max(m, v), 0)
  const thr = Math.max(ABS_FLOOR, peak * REL_THRESHOLD)
  const first = out.findIndex(v => v >= thr)
  if (first < 0) return { start: from, end: to }
  let last = out.length - 1
  while (last > first && out[last] < thr) last--
  return { start: Math.max(from, a + first * FRAME_S - PAD_START_S), end: Math.min(to, a + (last + 1) * FRAME_S + PAD_END_S) }
}
