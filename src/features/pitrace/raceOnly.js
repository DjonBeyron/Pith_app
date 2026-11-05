// «Только этот раунд» / «Вспомни на слух + финал» (Админ → «Голос» → «Встряхни память (стенд)»): план может нести round — id раунда, и тогда рецепт (raceRecipe.js) оставляет ТОЛЬКО его, без итога; по аналогии с rehearsalOnly.js («Шлифовка»).
// Режим «Вспомни на слух + финал» (round = STAGES_ROUND): оба прохода этапа «Вспомни на слух» (A «скажи слово», B «назови перевод») + итог с метриками и слабыми словами, без «Вершины» и «Спуска» и без вступления race_start (на старте Пит объявляет этап). Чистые функции без React.
export const STAGES_ROUND = 'stages'
export const STAGES_ACTS = ['sprint', 'catch']
export const RACE_ROUNDS = ['sprint', 'catch', 'climb', 'descent']
export const RACE_TITLES = { sprint: 'Проход A', catch: 'Проход B', climb: 'Вершина', descent: 'Спуск', [STAGES_ROUND]: 'Вспомни на слух + финал' }

/** round допустим в плане: один раунд или режим «два этапа + финал» */
export const isRound = round => RACE_ROUNDS.includes(round) || round === STAGES_ROUND

/** Акты рецепта после «только этот раунд»; «Вспомни на слух + финал» — оба прохода и итог; нет такого раунда (или round не задан) — все акты */
export function pickRound(acts, round) {
  if (round === STAGES_ROUND) return acts.filter(a => STAGES_ACTS.includes(a.id) || a.id === 'summary')
  return RACE_ROUNDS.includes(round) ? acts.filter(a => a.id === round) : acts
}
