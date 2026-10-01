// Ступени памяти — вкладка «Моя память» (PROJECT.md → «Вкладки»). Шаг памяти
// слова 1..5 (word_memory.step, интервалы 1/3/7/16/35 дней) → три ступени
// временной памяти (у блока — 1 / 2 / 3 обводки, memory-ladder.css):
//   1 «Новые»     — шаги 1–2: слово только появилось, спросим скоро;
//   2 «Знакомые»  — шаги 3–4 (с KNOW_STEP — «знаю»): слово уже узнаётся;
//   3 «Усвоенные» — шаг 5: слово хорошо знакомо, раз в месяц проверка.
// «Постоянная память» — пятиугольник (4 обводки), четвёртый уровень: усвоенное
// слово, вспомненное на месячной проверке (word_memory.settled_on, миграция
// 20260926120000).
export const LEVELS = [
  {
    id: 1, name: 'Новые слова', short: 'Новые', one: 'Новое слово', when: 'спросим завтра',
    remember: 'Слово только пришло в твою память — ему нужно немного времени, чтобы прижиться.',
    about: 'Сюда попадают слова из уроков, которые ты только что прошёл. Такие слова легко забываются — память ещё не успела за них уцепиться. Чтобы не забыть, мы напомним о слове уже завтра. Вспомнишь его пару раз — оно перейдёт в «Знакомые».',
  },
  {
    id: 2, name: 'Знакомые слова', short: 'Знакомые', one: 'Знакомое слово', when: 'спросим через неделю',
    remember: 'Ты уже узнаёшь это слово — осталось его закрепить.',
    about: 'Сюда слово переходит, когда ты уже несколько раз его вспомнил. Ты его узнаёшь, но без повторов оно всё равно потихоньку забудется. Чтобы этого не случилось, мы напомним о нём через неделю. Вспомнишь ещё пару раз — слово перейдёт в «Усвоенные».',
  },
  {
    id: 3, name: 'Усвоенные слова', short: 'Усвоенные', one: 'Усвоенное слово', when: 'спросим через месяц',
    remember: 'Ты хорошо знаешь это слово, но ему ещё нужны редкие повторы.',
    about: 'Сюда слово переходит, когда ты уже много раз его вспомнил. Ты хорошо знаешь его, но если надолго оставить без повторов, оно всё равно забудется. Чтобы этого не случилось, раз в месяц мы проверим, на месте ли слово. Вспомнишь его на такой проверке — оно перейдёт в постоянную память.',
  },
]

export const levelOf = step => (step >= 5 ? 3 : step >= 3 ? 2 : 1)

// Заливка слова — путь к следующей ступени: первый шаг ступени — четверть,
// второй — три четверти; усвоенное — полное
export const levelFill = step => (step >= 5 ? 1 : ((step - 1) % 2) * 0.5 + 0.25)

// Уровней всего — по числу обводок: 1 / 2 / 3 у ступеней и 4 у пятиугольника
export const LEVEL_COUNT = 4

// Пятиугольник — четвёртый уровень, вне временной памяти: название, описание
// вкладки (со словами и пустой) и «насколько помнит» для окна слова
export const SETTLED_NAME = 'Постоянная память'
export const SETTLED_ABOUT = 'Тут хранятся слова из «Усвоенных», которые ты вспомнил на месячной проверке. Они прочно закрепились в памяти и легко вспоминаются. Изредка мы всё равно напомним о них, чтобы слова не забывались. А если забудешь слово — оно вернётся в «Знакомые» и начнёт расти заново.'
export const SETTLED_ABOUT_EMPTY = 'Тут будут храниться слова из «Усвоенных», которые ты вспомнишь на месячной проверке. Такие слова прочно закрепляются в памяти и легко вспоминаются. Пока их нет — пройди с ними все ступени: новые → знакомые → усвоенные.'
const SETTLED_ONE = { one: 'Слово в постоянной памяти', remember: 'Слово прочно закрепилось в памяти — ты легко его вспоминаешь.' }

// Заголовок страницы уровня: «Первый уровень памяти» … «Четвёртый уровень памяти»
export const LEVEL_TITLES = ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(n => `${n} уровень памяти`)

// Четыре вкладки страницы уровней: три ступени и постоянная память. Общий вид
// вкладки — { id 1..4, short, title, name, about, when, words, perm }
export function pageTabs(ladder) {
  const steps = ladder.levels.map(l => ({
    id: l.id, short: l.short, title: LEVEL_TITLES[l.id - 1], name: l.name, about: l.about, when: l.when, words: l.words, perm: false,
  }))
  const perm = ladder.permanent
  return [...steps, {
    id: LEVEL_COUNT, short: 'Постоянная', title: LEVEL_TITLES[LEVEL_COUNT - 1], name: SETTLED_NAME,
    about: perm.length ? SETTLED_ABOUT : SETTLED_ABOUT_EMPTY, when: '', words: perm, perm: true,
  }]
}

// Уровень слова для окна слова: { n, name, remember } — n из LEVEL_COUNT.
// perm — слово из пятиугольника (settled_on)
export function wordLevel(step, perm = false) {
  if (perm) return { n: LEVEL_COUNT, name: SETTLED_ONE.one, remember: SETTLED_ONE.remember }
  const l = LEVELS[levelOf(step) - 1]
  return { n: l.id, name: l.one, remember: l.remember }
}

// Заливка трёх отрезков линии слова (Новые, Знакомые, Усвоенные), 0..1: пройденные
// ступени целиком, текущая — levelFill, будущие пусты
export const lineFills = step => [1, 2, 3].map(n => (n < levelOf(step) ? 1 : n > levelOf(step) ? 0 : levelFill(step)))

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
