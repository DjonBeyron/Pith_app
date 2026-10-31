// Одна строка про свёрнутые «Настройки» блока «Шлифовка репетиции»: режим звука, сколько реплик Пита озвучено, фикстура, а также то, что нельзя пропустить, не открывая раздел (идёт озвучка, ошибка озвучки, идёт прогон по режимам).
// Чистая функция без React.
import { RUN_ORDER } from './audioRun.js'

/** @param {{ preset: string, pit?: { done: number, total: number } | null, fixture?: string, busy?: string, error?: string, run?: { step: number, state: string } | null }} o → 'звук B · озвучено 12 из 15 · три куска' */
export function settingsSummary({ preset, pit = null, fixture = '', busy = '', error = '', run = null }) {
  const parts = [`звук ${preset}`, pit ? `озвучено ${pit.done} из ${pit.total}` : 'реплики: загружаю…']
  if (fixture) parts.push(fixture)
  if (busy) parts.push('озвучиваю…')
  if (error) parts.push('ошибка озвучки')
  if (run) parts.push(run.state === 'finished' ? 'прогон завершён' : `прогон: режим ${run.step + 1} из ${RUN_ORDER.length}`)
  return parts.join(' · ')
}
