// Ступени памяти — вкладка «Моя память» (PROJECT.md → «Вкладки»). Шаг памяти
// слова 1..5 (word_memory.step, интервалы 1/3/7/16/35 дней) → три ступени
// временной памяти (у блока — 1 / 2 / 3 обводки, memory-ladder.css):
//   1 «Новые»     — шаги 1–2: слово только появилось, спросим скоро;
//   2 «Знакомые»  — шаги 3–4 (с KNOW_STEP — «знаю»): слово уже узнаётся;
//   3 «Усвоенные» — шаг 5: значение понято и запомнено, раз в месяц проверка.
// «Закреплённые» — пятиугольник (4 обводки): усвоенное слово, вспомненное на
// месячной проверке (word_memory.settled_on, миграция 20260926120000).
export const LEVELS = [
  {
    id: 1, name: 'Новые слова', short: 'Новые', when: 'спросим завтра',
    about: 'Слово только появилось. Память его ещё не держит — поэтому спросим уже завтра. Вспомнишь пару раз — оно станет знакомым.',
  },
  {
    id: 2, name: 'Знакомые слова', short: 'Знакомые', when: 'спросим через неделю',
    about: 'Слово уже узнаётся, но память ещё может подвести. Спросим через неделю — и каждый удачный раз оно держится дольше.',
  },
  {
    id: 3, name: 'Усвоенные слова', short: 'Усвоенные', when: 'спросим через месяц',
    about: 'Значение слова хорошо понято и запомнено. Раз в месяц заглянем проверить, что оно на месте, — вспомнишь, и слово закрепится.',
  },
]

export const levelOf = step => (step >= 5 ? 3 : step >= 3 ? 2 : 1)

// Заливка слова — путь к следующей ступени: первый шаг ступени — четверть,
// второй — три четверти; усвоенное — полное
export const levelFill = step => (step >= 5 ? 1 : ((step - 1) % 2) * 0.5 + 0.25)

// Название пятиугольника — четвёртая ступень, вне временной памяти
export const SETTLED_NAME = 'Закреплённые слова'

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
