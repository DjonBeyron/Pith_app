// ЕДИНЫЙ СТАНДАРТ уровней памяти слов (PROJECT.md → «Стандарт уровней памяти», 2026-10-16). Все места, где нужны
// номер, название, подпись, цвет или CSS-класс уровня слова, берут их ТОЛЬКО отсюда — своих списков не заводим.
//   0 временные слова — вне word_memory (слова нет в памяти пользователя; серый)
//   1 новые           — word_memory.step 1–2 (зелёный)
//   2 знакомые        — шаги 3–4 (синий)
//   3 усвоенные       — шаг 5 (фиолетовый)
//   4 постоянная      — заполнено settled_on (золотистый, «сияние» без анимации)
// Сопоставление шагов БД не меняется (интервалы 1/3/7/16/35, memory_review_word, KNOW_STEP = 3 — в learn/guest/sql).
// Цвета в CSS — src/styles/memory-levels.css (--lvl0…--lvl4); hex здесь — копия для JS/SVG/canvas, тест их сверяет.
export const LEVEL_PERM = 4
export const LEVEL_COUNT_ALL = 5 // уровней всего: 0..4

export const MEMORY_LEVELS = [
  { id: 0, colorName: 'серый', key: 'temp', name: 'Временные', title: 'Временные слова', nameWord: 'временные слова', one: 'Временное слово', hex: '#9aa3b2', rgb: '154, 163, 178', steps: null },
  { id: 1, colorName: 'зелёный', key: 'new', name: 'Новые', title: 'Новые слова', nameWord: 'новые слова', one: 'Новое слово', hex: '#b6fe3b', rgb: '182, 254, 59', steps: [1, 2] },
  { id: 2, colorName: 'синий', key: 'known', name: 'Знакомые', title: 'Знакомые слова', nameWord: 'знакомые слова', one: 'Знакомое слово', hex: '#4fb3ee', rgb: '79, 179, 238', steps: [3, 4] },
  { id: 3, colorName: 'фиолетовый', key: 'learned', name: 'Усвоенные', title: 'Усвоенные слова', nameWord: 'усвоенные слова', one: 'Усвоенное слово', hex: '#9a76f8', rgb: '154, 118, 248', steps: [5, 5] },
  { id: 4, colorName: 'золотой', key: 'permanent', name: 'Постоянная память', title: 'Постоянная память', nameWord: 'слова в постоянной памяти', one: 'Слово в постоянной памяти', hex: '#d4a017', rgb: '212, 160, 23', steps: null },
]

const clampId = id => (id >= 0 && id <= LEVEL_PERM ? id : 0)
export const levelInfo = id => MEMORY_LEVELS[clampId(id)]

// Уровень по шагу памяти и признаку постоянной памяти: нет шага → 0 (слова нет в памяти)
export function levelOfStep(step, settled = false) {
  if (settled) return LEVEL_PERM
  if (!(step >= 1)) return 0
  return step >= 5 ? 3 : step >= 3 ? 2 : 1
}

// Уровень слова по строке word_memory { step, settled_on } | null (нет строки — уровень 0)
export const levelOfWord = row => (row ? levelOfStep(row.step, !!row.settled_on) : 0)

export const levelName = id => levelInfo(id).name // «Новые»
export const levelTitle = id => levelInfo(id).title // «Новые слова»
export const levelNameWord = id => levelInfo(id).nameWord // «новые слова» (в середине фразы)
export const levelOne = id => levelInfo(id).one // «Новое слово»
export const levelColorName = id => levelInfo(id).colorName // «зелёный» — для справок админа
export const levelHex = id => levelInfo(id).hex // для SVG/canvas
export const levelVar = id => `var(--lvl${clampId(id)})` // для style={{ color }}
export const levelRgbVar = id => `var(--lvl${clampId(id)}-rgb)`

// CSS-модификатор: levelClass('memChip', 4) → 'memChip--4'; суффикс всегда номер уровня (никаких Perm/P)
export const levelClass = (base, id) => `${base}--${clampId(id)}`
