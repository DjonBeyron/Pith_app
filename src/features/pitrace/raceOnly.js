// «Только этот раунд» и режимы этапов (Админ → «Голос» → «Встряхни память (стенд)»): план может нести round — id раунда (тогда рецепт raceRecipe.js оставляет ТОЛЬКО его, без итога) или id режима; по аналогии с rehearsalOnly.js («Шлифовка»).
// Режимы (MODES): «Пинг-понг + фразы + финал» (STAGES_ROUND, по умолчанию — крупная кнопка блока) — оба прохода «Пинг-понга», этап 2 «Фразы» и итог; «Пинг-понг + финал» (PINGPONG_ROUND, прежний режим) — без фраз.
// В режимах нет «Вершины» и «Спуска»; стартовая фраза race_start звучит (raceTexts.raceHasStart). Кнопки раундов блока — RACE_ROUNDS (одиночные раунды и прежний режим) с подписями RACE_TITLES. Чистые функции без React.
export const STAGES_ROUND = 'stages'
export const PINGPONG_ROUND = 'pingpong'
export const MODES = { [STAGES_ROUND]: ['sprint', 'catch', 'phrases', 'boss'], [PINGPONG_ROUND]: ['sprint', 'catch', 'boss'] } // финал «Шкала памяти» (boss) — в обоих режимах перед итогом (если слов хватает и не «Тапаю»)
export const STAGES_ACTS = MODES[STAGES_ROUND]
export const ONE_ROUNDS = ['sprint', 'catch', 'phrases', 'climb', 'descent']
export const RACE_ROUNDS = [...ONE_ROUNDS, PINGPONG_ROUND]
export const RACE_TITLES = { sprint: 'Проход A', catch: 'Проход B', phrases: 'Фразы', climb: 'Вершина', descent: 'Спуск', boss: 'Шкала памяти', [STAGES_ROUND]: 'Пинг-понг + фразы + финал', [PINGPONG_ROUND]: 'Пинг-понг + финал' }

/** round — режим этапов с итогом (а не одиночный раунд) */
export const isMode = round => !!MODES[round]

/** round допустим в плане: один раунд или режим */
export const isRound = round => ONE_ROUNDS.includes(round) || isMode(round)

/** Акты рецепта после «только этот раунд»; режим — его акты и итог; нет такого раунда (или round не задан) — все акты */
export function pickRound(acts, round) {
  if (isMode(round)) return acts.filter(a => MODES[round].includes(a.id) || a.id === 'summary')
  return ONE_ROUNDS.includes(round) ? acts.filter(a => a.id === round) : acts
}
