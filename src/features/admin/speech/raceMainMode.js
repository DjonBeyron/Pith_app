import * as raceOnly from '../../pitrace/raceOnly.js'

// Режим главной кнопки «Встряхни память» (Админ → «Голос» → блок стенда): режим игры по умолчанию из raceOnly.js. Каталог режимов правит движок игры, поэтому здесь ничего не зашито:
// есть функция defaultRaceMode() — её ответ; есть константа DEFAULT_RACE_MODE / DEFAULT_ROUND — она; иначе «Пинг-понг + финал» (STAGES_ROUND); нет и его — первый ключ RACE_TITLES.
export function mainRaceMode(mod = raceOnly) {
  if (typeof mod.defaultRaceMode === 'function') return mod.defaultRaceMode()
  return mod.DEFAULT_RACE_MODE ?? mod.DEFAULT_ROUND ?? mod.STAGES_ROUND ?? Object.keys(mod.RACE_TITLES ?? {})[0] ?? null
}

/** Подпись режима для кнопки: «Пинг-понг + финал»; неизвестный — пусто */
export const mainRaceTitle = (mod = raceOnly) => mod.RACE_TITLES?.[mainRaceMode(mod)] ?? ''
