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
    id: 1, name: 'Новые слова', short: 'Новые', one: 'Новое слово', when: 'спросим завтра',
    remember: 'Слово только появилось — ты его пока почти не помнишь.',
    about: 'Сюда попадают слова из уроков, которые ты только что прошёл. Такие слова легко забываются — память ещё не успела за них уцепиться. Чтобы не забыть, мы напомним о слове уже завтра. Вспомнишь его пару раз — оно перейдёт в «Знакомые».',
  },
  {
    id: 2, name: 'Знакомые слова', short: 'Знакомые', one: 'Знакомое слово', when: 'спросим через неделю',
    remember: 'Ты узнаёшь это слово, но память ещё может подвести.',
    about: 'Сюда слово переходит, когда ты уже несколько раз его вспомнил. Ты его узнаёшь, но без повторов оно всё равно потихоньку забудется. Чтобы этого не случилось, мы напомним о нём через неделю. Вспомнишь ещё пару раз — слово перейдёт в «Усвоенные».',
  },
  {
    id: 3, name: 'Усвоенные слова', short: 'Усвоенные', one: 'Усвоенное слово', when: 'спросим через месяц',
    remember: 'Значение слова хорошо понято и запомнено.',
    about: 'Сюда слово приходит, когда ты много раз вспомнил его вовремя. Значение понято и запомнено, но со временем и такие слова тускнеют. Чтобы этого не случилось, раз в месяц мы проверим, что слово на месте. Вспомнишь его на такой проверке — оно станет «Закреплённым».',
  },
]

export const levelOf = step => (step >= 5 ? 3 : step >= 3 ? 2 : 1)

// Заливка слова — путь к следующей ступени: первый шаг ступени — четверть,
// второй — три четверти; усвоенное — полное
export const levelFill = step => (step >= 5 ? 1 : ((step - 1) % 2) * 0.5 + 0.25)

// Пятиугольник — четвёртая ступень, вне временной памяти: название, описание
// страницы (со словами и пустой) и «насколько помнит» для окна слова
export const SETTLED_NAME = 'Закреплённые слова'
export const SETTLED_ABOUT = 'Сюда слово попадает, когда ты вспомнил его на месячной проверке. Оно прочно закрепилось в памяти и легко вспоминается. Изредка мы всё равно напомним о нём, чтобы слово не тускнело. А если забудешь — слово вернётся в «Знакомые» и начнёт расти заново.'
export const SETTLED_ABOUT_EMPTY = 'Сюда слово попадает, когда ты вспомнил его на месячной проверке в «Усвоенных». Такое слово прочно закрепляется в памяти и легко вспоминается. Пока таких слов нет — пройди с ними все ступени: новые → знакомые → усвоенные.'
const SETTLED_ONE = { one: 'Закреплённое слово', remember: 'Слово прочно закрепилось в памяти — ты легко его вспоминаешь.' }

// Уровней всего — по числу обводок: 1 / 2 / 3 у ступеней и 4 у пятиугольника
export const LEVEL_COUNT = 4

// Уровень слова для окна слова: { n, name, remember } — n из LEVEL_COUNT.
// perm — слово из пятиугольника (settled_on)
export function wordLevel(step, perm = false) {
  if (perm) return { n: LEVEL_COUNT, name: SETTLED_ONE.one, remember: SETTLED_ONE.remember }
  const l = LEVELS[levelOf(step) - 1]
  return { n: l.id, name: l.one, remember: l.remember }
}

// Весь путь слова 0..1 — обводка слова зеленеет по мере роста
export const journey = step => (step >= 5 ? 1 : (levelOf(step) - 1 + levelFill(step)) / 3)

// memory     — строки word_memory [{ word, step, due_on, settled_on? }]
// todayWords — Set слов сегодняшнего повторения (pickToday)
// hasDeck    — есть ли у слова колода (без неё слово не в расписании)
// wordHome   — Map слово → { lessonId, lessonTitle, phrase } (урок-слово и
//              фраза, откуда слово пришло)
// Слова ступени: сегодняшние первыми, дальше — кого спросим раньше
export function buildLadder(memory, { todayWords = new Set(), hasDeck = () => true, wordHome = new Map() } = {}) {
  const levels = LEVELS.map(l => ({ ...l, words: [] }))
  const permanent = []
  for (const m of memory ?? []) {
    const home = wordHome.get(m.word)
    const w = {
      word: m.word, step: m.step, due: m.due_on,
      today: todayWords.has(m.word), hasDeck: hasDeck(m.word),
      lessonId: home?.lessonId ?? null, lessonTitle: home?.lessonTitle ?? '', phrase: home?.phrase ?? '',
    }
    if (m.settled_on) permanent.push(w)
    else levels[levelOf(m.step) - 1].words.push(w)
  }
  const order = (a, b) => (b.today - a.today) || String(a.due).localeCompare(String(b.due)) || a.word.localeCompare(b.word)
  levels.forEach(l => l.words.sort(order))
  permanent.sort((a, b) => a.word.localeCompare(b.word))
  return { levels, permanent, total: levels.reduce((n, l) => n + l.words.length, 0) }
}
