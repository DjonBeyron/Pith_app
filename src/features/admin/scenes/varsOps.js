import { VAR_LIMITS, VAR_PICKS, tokenizeTemplate, fillTemplate, sceneVarNames } from '../../scene/v2/sceneVars.js'
import { LIMITS } from '../../scene/v2/sceneConstants.js'

// Операции над словами пользователя в сцене (vars; блок «Слова пользователя») для сборщика — чистые функции scene → scene
// (та же сцена, если менять нечего). Формат и подстановка — scene/v2/sceneVars.js, UI — VarsPanel.jsx.

const MAX_TEXT = LIMITS.maxTextLen

// Подписи типов отбора слов (pick) для интерфейса — по стандарту уровней памяти (memoryLevels.js): weak = уровень 1,
// due = просрочены, known = уровни 2–4. Логика отбора (step ≥ 3 и т.д.) не менялась, только названия
export const PICK_LABEL = { weak: 'Новые слова (уровень 1, зелёные)', due: 'Пора повторить (просрочены)', known: 'Знакомые и выше (уровни 2–4)' }
// Цветные кружки уровней у типа отбора (due — любой уровень, без кружков)
export const PICK_LEVELS = { weak: [1], due: [], known: [2, 3, 4] }

// Имя переменной: только латиница/цифры/_, до 16 символов
export const cleanVarName = v => String(v ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, VAR_LIMITS.maxName)

// Свободное имя word, word2, word3…
function freeName(vars) {
  for (let i = 1; i <= VAR_LIMITS.maxVars + 1; i++) {
    const n = i === 1 ? 'word' : `word${i}`
    if (!(n in vars)) return n
  }
  return 'word_x'
}

export function addVar(scene) {
  const vars = scene.vars ?? {}
  if (Object.keys(vars).length >= VAR_LIMITS.maxVars) return scene
  return { ...scene, vars: { ...vars, [freeName(vars)]: { pick: 'weak', fallback: { text: 'apple', translation: 'яблоко' } } } }
}

// Переписать плейсхолдеры строки: fn(token) → новая строка плейсхолдера | null (оставить как было)
function mapPlaceholders(str, fn) {
  if (typeof str !== 'string') return str
  return tokenizeTemplate(str).map(t => {
    if (t.name) return fn(t) ?? t.raw
    if (t.esc) return t.lit === '{' ? '{{' : '}}'
    return t.lit ?? t.stray
  }).join('')
}

// fn(строка, поле) переписывает text/translation каждой реплики, segFn — элементы segments (null — убрать)
function mapTimeline(scene, fn, segFn = sg => sg) {
  return { ...scene, timeline: scene.timeline.map(l => {
    const out = { ...l, text: fn(l.text, 'text') }
    if (typeof l.translation === 'string') out.translation = fn(l.translation, 'translation')
    if (Array.isArray(l.segments)) {
      const segs = l.segments.map(segFn).filter(Boolean)
      if (segs.length) out.segments = segs; else delete out.segments
    }
    return out
  }) }
}

// Убрать переменную: её плейсхолдеры в репликах заменяются запасным словом, чтобы сцена не осталась с «{name}»
export function removeVar(scene, name) {
  const gone = scene.vars?.[name]
  if (!gone) return scene
  const { [name]: _gone, ...rest } = scene.vars
  const fb = gone.fallback ?? {}
  const next = mapTimeline(scene, str => mapPlaceholders(str, t => (t.name === name ? ((t.ru ? fb.translation : null) ?? fb.text ?? '') : null)), sg => (sg.var === name ? null : sg))
  if (Object.keys(rest).length) return { ...next, vars: rest }
  // переменных не осталось — сцена обычная: {{ }} превращаются в литеральные скобки (в обычной сцене они не экранируются)
  const { vars: _vars, ...noVars } = mapTimeline(next, str => fillTemplate(str, () => null))
  return noVars
}

// Переименовать переменную по номеру: ключи сохраняют порядок, плейсхолдеры и segments в репликах переписываются.
// Пустое/занятое/то же имя — без изменений
export function renameVarAt(scene, index, rawName) {
  const names = sceneVarNames(scene)
  const old = names[index]
  const name = cleanVarName(rawName)
  if (old === undefined || !name || name === old || names.includes(name)) return scene
  const vars = Object.fromEntries(Object.entries(scene.vars).map(([k, v]) => [k === old ? name : k, v]))
  const ren = str => mapPlaceholders(str, t => (t.name === old ? `{${name}${t.ru ? ':ru' : ''}}` : null))
  return { ...mapTimeline(scene, ren, sg => (sg.var === old ? { ...sg, var: name } : sg)), vars }
}

// Правка полей переменной: { pick?, text?, translation? } (translation пустой — убирается)
export function updateVar(scene, name, patch) {
  const cur = scene.vars?.[name]
  if (!cur) return scene
  const fb = { ...cur.fallback }
  const next = { ...cur }
  if ('pick' in patch && VAR_PICKS.includes(patch.pick)) next.pick = patch.pick
  if ('text' in patch) fb.text = String(patch.text ?? '').slice(0, VAR_LIMITS.maxWord)
  if ('translation' in patch) {
    const t = String(patch.translation ?? '').slice(0, VAR_LIMITS.maxWord)
    if (t.trim()) fb.translation = t; else delete fb.translation
  }
  return { ...scene, vars: { ...scene.vars, [name]: { ...next, fallback: fb } } }
}

// Строка плейсхолдера для вставки: в text — {name}, в translation — {name:ru}
export const placeholderFor = (name, field) => `{${name}${field === 'translation' ? ':ru' : ''}}`

// Вставка плейсхолдера в строку на место выделения [start, end]; не влезает в лимит — строка как была
export function insertPlaceholder(str, name, field, start = null, end = null) {
  const s = String(str ?? '')
  const a = start == null ? s.length : Math.max(0, Math.min(start, s.length))
  const b = end == null ? a : Math.max(a, Math.min(end, s.length))
  const ph = placeholderFor(name, field)
  const out = s.slice(0, a) + ph + s.slice(b)
  return out.length > MAX_TEXT ? { text: s, caret: a } : { text: out, caret: a + ph.length }
}

// Реплика i: вставить плейсхолдер переменной в text или translation на выделение [start, end]
export function insertVarInLine(scene, i, field, name, start, end) {
  const l = scene.timeline[i]
  if (!l || !scene.vars?.[name] || (field !== 'text' && field !== 'translation')) return scene
  const { text } = insertPlaceholder(l[field], name, field, start, end)
  if (text === (l[field] ?? '')) return scene
  return { ...scene, timeline: scene.timeline.map((x, j) => (j === i ? { ...x, [field]: text } : x)) }
}
