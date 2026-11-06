// Данные для тестов плана из памяти (racePhrasePool.test.js, racePlanMemory.test.js): модули-фразы, уроки-слова, строки word_memory. Только для тестов.
const lesson = (id, title) => ({ id, title })
export const LESSONS = [
  lesson('s1', 'start'), lesson('e1', 'end'),
  lesson('l-nice', 'Nice'), lesson('l-meet', 'meet'), lesson('l-you', 'you'),
  lesson('l-where', 'where'), lesson('l-from', 'from'),
  lesson('l-how', 'how'), lesson('l-old', 'old'),
  lesson('l-good', 'good'), lesson('l-morning', 'morning'),
  lesson('l-thank', 'thank'), lesson('l-see', 'see'), lesson('l-later', 'later'),
]
const mod = (id, title, created_at, words, extra = {}) => ({
  id, title, created_at, published: true,
  lesson_ids: ['s1', ...words.map(w => `l-${w}`), 'e1'],
  word_translations: words.map(w => ({ w, t: `пер-${w}` })),
  title_translation: `перевод ${title}`,
  ...extra,
})
// created_at нарочно не по порядку id: первые три по дате — m3, m1, m5
export const CURRICULA = [
  mod('m1', 'Nice to meet you', '2026-01-02T00:00:00Z', ['nice', 'meet', 'you']),
  mod('m2', 'Where are you from', '2026-03-01T00:00:00Z', ['where', 'you', 'from']),
  mod('m3', 'How old are you', '2026-01-01T00:00:00Z', ['how', 'old', 'you']),
  mod('m4', 'Good morning', '2026-04-01T00:00:00Z', ['good', 'morning']),
  mod('m5', 'Thank you', '2026-01-03T00:00:00Z', ['thank', 'you']),
  mod('m6', 'See you later', '2026-05-01T00:00:00Z', ['see', 'you', 'later']),
  mod('m7', 'Draft phrase', '2025-01-01T00:00:00Z', ['good'], { published: false }),
]
export const row = (word, step, extra = {}) => ({ word, step, due_on: '2026-12-01', lapses: 0, settled_on: null, ...extra })
export const BASE = { phrase: 'Nice | to meet you', chunks: ['Nice', 'to meet you'], translation: 'Приятно познакомиться', words: [{ text: 'meet', translation: 'встретить' }], seed: 's1' }
export const deps = (over = {}) => ({ curricula: CURRICULA, lessons: LESSONS, memory: [], startedIds: [], phraseRows: [], audioMap: {}, ruMap: {}, today: '2026-11-06', ...over })
