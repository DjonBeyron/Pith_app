// Сценарий «Записи набора» стенда пилюль (v3.3.188, CONCEPT_VOICESET.md): какие клипы и в каком порядке наговаривает человек. Порядок детерминированный: тишина 20 с → слова (сгруппированы по
// слову: вид за видом, повтор за повтором — не надо переключаться) → «не слова» → фразы (целиком и с недоговорённым последним словом) → обычный фон 20 с → блок «на вытянутой руке» (far: виды
// whole и nolast по разу на слово; перед блоком запись сама встаёт на паузу — человек отодвигает телефон один раз). Подсказка «что сказать» для обрубков строится по буквам — это подсказка человеку,
// а не эталон. expect — что должно быть при прогоне (scripts/voice-set-run.mjs): 'hit' — зачёт, 'none' — зачёта быть не должно. Чистый модуль.
export const PLAN_V = 1
export const DEFAULT_WORDS = ['house', 'nice', 'milk', 'from', 'tree', 'book', 'cat', 'dog', 'water', 'apple', 'window', 'breakfast', 'yesterday', 'together', 'interesting', 'wonderful']
export const PHRASES = ['See you later', 'I love you', 'Nice to meet you']
export const VARIANTS = ['whole', 'quiet', 'fast', 'nolast', 'half']
export const FAR_VARIANTS = ['whole', 'nolast']
export const REPS = [1, 2, 3]
export const MAX_WORDS = 40
export const VARIANT_TASK = {
  whole: 'целиком, обычным голосом', quiet: 'целиком, тихо — как в игре', fast: 'целиком, быстро', nolast: 'без последнего звука', half: 'только начало, примерно половина',
  cutlast: 'последнее слово не договаривай', long: '', noise: '',
}
export const SECTION_TITLE = { silence: 'Тишина', words: 'Слова', noise: 'Не слова', phrases: 'Фразы', background: 'Фон', far: 'На вытянутой руке' }
export const WORD_MS = 2200    // окно записи слова
export const PHRASE_MS = 4000  // окно фразы
export const LONG_MS = 20000   // тишина / фон
export const NOISE_MS = 3000   // кашель, «э-э», стук
export const GAP_MS = 700      // пауза между клипами: видно следующее задание
export const PRE_MS = 500      // предзапись: столько звука перед окном входит в клип (слово, начатое чуть раньше полосы, не теряет начало; прогонщику — настоящий фон перед словом)
const NOISES = [
  { id: 'cough', text: 'Кашель', task: 'покашляй один-два раза' },
  { id: 'uh', text: '«Э-э-э»', task: 'потяни «э-э-э» или «м-м-м» — без слов' },
  { id: 'knock', text: 'Стук', task: 'постучи пальцем по столу рядом с телефоном' },
]
const VOWELS = 'aeiouy'
const ONE_SOUND = ['ee', 'oo', 'ea', 'ou', 'ow', 'ay', 'ey', 'er', 'or', 'ar', 'ck', 'sh', 'ch', 'th', 'ng', 'll', 'ss']
const hasVowel = s => [...s].some(c => VOWELS.includes(c))

/** Список слов из поля ввода (запятые, точки с запятой, переводы строк): латиница, апостроф, дефис; без повторов; пусто — слова по умолчанию */
export function parseWords(text) {
  const out = []
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    const w = raw.toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()
    if (w && !out.includes(w) && out.length < MAX_WORDS) out.push(w)
  }
  return out.length ? out : [...DEFAULT_WORDS]
}

/** «house» → «hou…», «milk» → «mil…», «tree» → «tr…»: без немого «e» на конце и без последнего звука (буквосочетание одного звука снимается целиком) */
export function hintNoLast(word) {
  let w = String(word).toLowerCase()
  if (w.length > 3 && w.endsWith('e') && !VOWELS.includes(w.at(-2)) && hasVowel(w.slice(0, -1))) w = w.slice(0, -1)
  const two = ONE_SOUND.find(d => w.length > 2 && w.endsWith(d))
  const cut = w.slice(0, two ? -2 : -1)
  return `${cut || w[0]}…`
}

/** «interesting» → «inter…», «wonderful» → «wond…», «from» → «fro…»: примерно половина букв, не короче первого слога */
export function hintHalf(word) {
  const w = String(word).toLowerCase()
  let n = Math.max(2, Math.floor(w.length / 2))
  while (n < w.length - 1 && !hasVowel(w.slice(0, n))) n++
  let p = w.slice(0, n)
  if (p.length >= 4) { const t = p.replace(/[aeiouy]+$/, ''); if (hasVowel(t)) p = t }
  return `${p}…`
}

/** «See you later» → «See you la…» */
export function hintCutLast(phrase) {
  const ws = String(phrase).trim().split(/\s+/)
  return [...ws.slice(0, -1), hintHalf(ws.at(-1))].join(' ')
}

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'
/** clips/007_house_nolast_2.wav (far — «whole-far») */
export const clipFile = it => `clips/${String(it.i + 1).padStart(3, '0')}_${slug(it.text)}_${it.variant}${it.far ? '-far' : ''}_${it.rep}.wav`

const wordItem = (word, variant, rep, far = false) => ({
  kind: 'word', section: far ? 'far' : 'words', text: word, variant, rep, far, ms: WORD_MS, voiced: true, expect: variant === 'nolast' || variant === 'half' ? 'none' : 'hit',
  task: `${VARIANT_TASK[variant]}${far ? ' — телефон на вытянутой руке' : ''}`, hint: variant === 'nolast' ? hintNoLast(word) : variant === 'half' ? hintHalf(word) : word,
})

/** Сценарий: [{ i, kind: 'word' | 'phrase' | 'noise' | 'long', section, text, variant, rep, far, ms, voiced, expect, task, hint, hold? }] */
export function buildPlan({ words = DEFAULT_WORDS, reps = 3, far = false } = {}) {
  const n = REPS.includes(reps) ? reps : 3, list = words.length ? words : DEFAULT_WORDS, out = []
  out.push({ kind: 'long', section: 'silence', text: 'Тишина', id: 'silence', variant: 'long', rep: 1, far: false, ms: LONG_MS, voiced: false, expect: 'none', task: '20 секунд молчи и не двигай телефон', hint: '' })
  for (const w of list) for (const v of VARIANTS) for (let r = 1; r <= n; r++) out.push(wordItem(w, v, r))
  for (const z of NOISES) out.push({ kind: 'noise', section: 'noise', text: z.text, id: z.id, variant: 'noise', rep: 1, far: false, ms: NOISE_MS, voiced: true, expect: 'none', task: z.task, hint: '' })
  for (const p of PHRASES) {
    out.push({ kind: 'phrase', section: 'phrases', text: p, variant: 'whole', rep: 1, far: false, ms: PHRASE_MS, voiced: true, expect: 'hit', task: 'фраза целиком, обычным голосом', hint: p })
    out.push({ kind: 'phrase', section: 'phrases', text: p, variant: 'cutlast', rep: 1, far: false, ms: PHRASE_MS, voiced: true, expect: 'none', task: VARIANT_TASK.cutlast, hint: hintCutLast(p) })
  }
  out.push({ kind: 'long', section: 'background', text: 'Обычный фон', id: 'background', variant: 'long', rep: 1, far: false, ms: LONG_MS, voiced: false, expect: 'none', task: '20 секунд не говори: пусть шумит комната — как обычно во время игры', hint: '' })
  if (far) for (const w of list) for (const v of FAR_VARIANTS) out.push(wordItem(w, v, 1, true))
  out.forEach((it, i) => { it.i = i; if (it.section === 'far' && out[i - 1]?.section !== 'far') it.hold = 'Дальше — то же, но телефон на вытянутой руке. Отодвинь телефон и нажми «Продолжить»' })
  for (const it of out) it.file = clipFile({ ...it, text: it.id ?? it.text })
  return out
}

/** Подпись настроек набора: начатый набор продолжается только со своим сценарием */
export const planSig = ({ words, reps, far }) => JSON.stringify({ v: PLAN_V, words, reps, far: !!far })

/** Оценка набора: { count, recMs (звук в клипах с предзаписью), totalMs (с паузами), bytes (WAV 16 кГц, 16 бит, моно) } */
export function planStats(items, rate = 16000) {
  const recMs = items.reduce((s, it) => s + it.ms + PRE_MS, 0)
  return { count: items.length, recMs, totalMs: items.reduce((s, it) => s + it.ms + GAP_MS, 0), bytes: Math.round(recMs / 1000 * rate * 2) + items.length * 44 }
}
