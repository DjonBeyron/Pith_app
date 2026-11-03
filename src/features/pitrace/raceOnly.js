// «Только этот раунд» (Админ → «Голос» → «Гонка с Питом (стенд)»): план может нести round — id раунда, и тогда рецепт (raceRecipe.js) оставляет ТОЛЬКО его, без итога; по аналогии с rehearsalOnly.js («Шлифовка»).
// Раунды: sprint — «Разгон», catch — «Слушай и лови», climb — «Вершина», descent — «Спуск». Чистые функции без React.
export const RACE_ROUNDS = ['sprint', 'catch', 'climb', 'descent']
export const RACE_TITLES = { sprint: 'Разгон', catch: 'Слушай и лови', climb: 'Вершина', descent: 'Спуск' }

/** Акты рецепта после «только этот раунд»; нет такого раунда (или round не задан) — все акты */
export const pickRound = (acts, round) => (RACE_ROUNDS.includes(round) ? acts.filter(a => a.id === round) : acts)
