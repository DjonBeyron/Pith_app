// «Прогон по режимам» («Шлифовка репетиции»): выбранный этап запускается в режиме A, после выхода из игры выбирается следующий режим (B) и предлагается «Запустить B» — сам прогон не стартует: запуск игры требует жеста
// (тапа). И так до H. Чистая машина шагов без React: run = { act, step (индекс режима в RUN_ORDER), state: 'ready' | 'playing' | 'finished' }.
import { PRESET_IDS, describePreset } from './audioPresets.js'

export const RUN_ORDER = PRESET_IDS

/** Начало прогона для этапа act: первый режим (A), ждёт запуска */
export const beginRun = act => ({ act, step: 0, state: 'ready' })

/** Режим текущего шага */
export const runPresetId = run => (run ? RUN_ORDER[Math.min(run.step, RUN_ORDER.length - 1)] : null)

/** Игра шага запущена */
export const markPlaying = run => (run && run.state === 'ready' ? { ...run, state: 'playing' } : run)

/** Игра шага закончилась (вышли из игры): следующий режим ждёт запуска; после последнего — прогон завершён */
export function finishStep(run) {
  if (!run || run.state !== 'playing') return run
  const next = run.step + 1
  return next >= RUN_ORDER.length ? { ...run, step: RUN_ORDER.length - 1, state: 'finished' } : { ...run, step: next, state: 'ready' }
}

/** Игра шага не открылась (микрофон не дали и т. п.): шаг остаётся тем же, можно запустить ещё раз */
export const abortStep = run => (run && run.state === 'playing' ? { ...run, state: 'ready' } : run)

/** Текст про текущий шаг: «Шаг 2 из 8: режим B — … Нажми «Запустить B»» */
export function runStatus(run) {
  if (!run) return ''
  const id = runPresetId(run)
  const head = `Шаг ${run.step + 1} из ${RUN_ORDER.length}`
  if (run.state === 'finished') return `Прогон завершён: все ${RUN_ORDER.length} режимов пройдены. Нажми «Экспорт прогонов» и пришли файл.`
  if (run.state === 'playing') return `${head}: идёт режим ${describePreset(id)}`
  return `${head}: следующий режим ${describePreset(id)}. Нажми «Запустить ${id}».`
}
