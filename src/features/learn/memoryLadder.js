// Ступени памяти — вкладка «Моя память» (PROJECT.md → «Вкладки»). Шаг памяти
// слова 1..5 (word_memory.step, интервалы 1/3/7/16/35 дней) → три ступени
// временной памяти:
//   1 «Новенькие» — шаги 1–2: память их ещё не держит, спросим скоро;
//   2 «Мои»       — шаги 3–4 (с KNOW_STEP — «знаю»): спросим через неделю;
//   3 «Родные»    — шаг 5: раз в месяц проверка.
// Постоянная память — родное слово, выдержавшее месячную проверку
// (word_memory.settled_on, этап 3; пока колонки нет — таких слов нет).
export const LEVELS = [
  {
    id: 1, name: 'Новенькие слова', short: 'Новенькие', when: 'спросим завтра',
    about: 'Только что из урока. Память их ещё не держит — поэтому спросим уже завтра. Вспомнишь пару раз — слово станет твоим.',
  },
  {
    id: 2, name: 'Мои слова', short: 'Мои', when: 'спросим через неделю',
    about: 'Ты их уже узнаёшь, но память ещё может подвести. Спросим через неделю — и каждый удачный раз слово держится дольше.',
  },
  {
    id: 3, name: 'Родные слова', short: 'Родные', when: 'спросим через месяц',
    about: 'Стали как родные — вылетают сами, не задумываясь. Раз в месяц заглянем проверить, что они на месте. Делать ничего не нужно.',
  },
]

export const levelOf = step => (step >= 5 ? 3 : step >= 3 ? 2 : 1)

// Заливка слова — путь к следующей ступени: первый шаг ступени — четверть,
// второй — три четверти; родное — полное
export const levelFill = step => (step >= 5 ? 1 : ((step - 1) % 2) * 0.5 + 0.25)

// Весь путь слова 0..1 — обводка слова зеленеет по мере роста
export const journey = step => (step >= 5 ? 1 : (levelOf(step) - 1 + levelFill(step)) / 3)

// memory     — строки word_memory [{ word, step, due_on, settled_on? }]
// todayWords — Set слов сегодняшнего повторения (pickToday)
// hasDeck    — есть ли у слова колода (без неё слово не в расписании)
// wordHome   — Map слово → { lessonId, phrase } (первая фраза со словом)
// Слова ступени: сегодняшние первыми, дальше — кого спросим раньше
export function buildLadder(memory, { todayWords = new Set(), hasDeck = () => true, wordHome = new Map() } = {}) {
  const levels = LEVELS.map(l => ({ ...l, words: [] }))
  const permanent = []
  for (const m of memory ?? []) {
    const home = wordHome.get(m.word)
    const w = {
      word: m.word, step: m.step, due: m.due_on,
      today: todayWords.has(m.word), hasDeck: hasDeck(m.word),
      lessonId: home?.lessonId ?? null, phrase: home?.phrase ?? '',
    }
    if (m.settled_on) permanent.push(w)
    else levels[levelOf(m.step) - 1].words.push(w)
  }
  const order = (a, b) => (b.today - a.today) || String(a.due).localeCompare(String(b.due)) || a.word.localeCompare(b.word)
  levels.forEach(l => l.words.sort(order))
  permanent.sort((a, b) => a.word.localeCompare(b.word))
  return { levels, permanent, total: levels.reduce((n, l) => n + l.words.length, 0) }
}
