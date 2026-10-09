// Эксперименты пробы «Голос» против «домысливания» движка (сказал «I'm try» — в итоге «I'm trying»): чистая логика режимов —
// настройки в localStorage, проверка поддержки на устройстве, ошибочные формы из эталона, JSGF/Vosk-грамматики и настройка
// распознавателя через configure-хук speechController. Без React; window/localStorage передаются снаружи.
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'

export const AP_KEY = 'pithy_admin_voice_antipredict_v1'
export const LANG_VARIANTS = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-CA', 'en']
export const MAX_ALTS = 10 // в пробе по умолчанию 3 (speechController)
export const BOOST = 5     // вес фраз Chrome 142+ (0–10): и верной фразе, и ошибочным — одинаковый, чтобы не было перекоса в одну сторону
export const MODE_IDS = ['lang', 'alts', 'history', 'words', 'local', 'phrases', 'grammar']
export const DEFAULT_SETTINGS = { lang: '', alts: false, history: false, words: false, local: false, phrases: false, grammar: false }

export function sanitizeSettings(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const s = { ...DEFAULT_SETTINGS, lang: LANG_VARIANTS.includes(o.lang) ? o.lang : '' }
  for (const k of MODE_IDS) if (k !== 'lang') s[k] = o[k] === true
  return s
}

export function readSettings(store = globalThis.localStorage) {
  try { return sanitizeSettings(JSON.parse(store.getItem(AP_KEY))) } catch { return { ...DEFAULT_SETTINGS } }
}

export function writeSettings(settings, store = globalThis.localStorage) {
  try { store.setItem(AP_KEY, JSON.stringify(settings)) } catch { /* приватный режим — выбор живёт до перезагрузки */ }
}

/** Что умеет это устройство (feature-detect, без запуска микрофона). win — window или подставной объект */
export function detectFeatures(win = globalThis.window) {
  const Ctor = win?.SpeechRecognition || win?.webkitSpeechRecognition || null
  const proto = Ctor?.prototype
  const has = k => !!proto && k in proto
  const Grammar = win?.SpeechGrammarList || win?.webkitSpeechGrammarList
  return {
    recognition: !!Ctor,
    local: has('processLocally'),
    localAvailable: typeof Ctor?.available === 'function',
    localInstall: typeof Ctor?.install === 'function',
    phrases: has('phrases') && typeof win?.SpeechRecognitionPhrase === 'function',
    grammar: typeof Grammar === 'function' && has('grammars'),
  }
}

export const UNSUPPORTED = {
  recognition: 'нет распознавания речи в браузере',
  local: 'не поддерживается здесь (нужен Chrome 139+ на компьютере или Android; на iPhone нет)',
  phrases: 'не поддерживается здесь (нужен Chrome 142+; на iPhone нет)',
  grammar: 'не поддерживается здесь (в браузере нет SpeechGrammarList)',
}

/** Режим доступен на устройстве? Языки, альтернативы, история, по словам — везде, где есть распознавание */
export function modeSupported(id, f) {
  if (!f.recognition) return false
  return id === 'local' || id === 'phrases' || id === 'grammar' ? !!f[id] : true
}

/** Настройки с отброшенными режимами, которых на устройстве нет (в журнал и в configure идут только рабочие) */
export function effectiveSettings(settings, f) {
  const s = { ...settings }
  for (const id of MODE_IDS) if (!modeSupported(id, f)) s[id] = id === 'lang' ? '' : false
  return s
}

/** Список включённых режимов для журнала/отчёта: ['lang:en-GB','alts','words',…,'oneword'] */
export function activeModes(settings, f, oneWord = false) {
  const s = effectiveSettings(settings, f)
  const out = []
  if (s.lang) out.push(`lang:${s.lang}`)
  for (const id of MODE_IDS) if (id !== 'lang' && s[id]) out.push(id)
  if (oneWord) out.push('oneword')
  return out
}

// ---- ошибочные формы ----
// Типичные ошибки учеников: слово эталона → чем его подменяют
const WRONG = {
  trying: ['try', 'tried', 'tries'], tried: ['try', 'trying'], tries: ['try', 'trying'],
  going: ['go', 'goes', 'went'], goes: ['go', 'going'], go: ['goes', 'going'], went: ['go', 'goed'],
  am: ['is', 'are'], is: ['are', 'am'], are: ['is', 'am'],
  has: ['have'], have: ['has'], had: ['have'], was: ['were'], were: ['was'],
  does: ['do'], do: ['does'], doing: ['do', 'does'], "doesn't": ["don't"], "don't": ["doesn't"],
  want: ['wants'], wants: ['want'], like: ['likes'], likes: ['like'], children: ['childs'], people: ['peoples'],
}
const NO_S = new Set(['this', 'his', 'always', 'perhaps', 'its', 'yes', 'across', 'unless', 'sometimes'])

const coreOf = w => w.toLowerCase().replace(/[^a-z']/g, '')

/** Ошибочные формы ОДНОГО слова (по таблице, затем по суффиксам -ing / -ed / -s). Не знаем слово — [] */
export function wrongFormsOfWord(word) {
  const w = coreOf(word)
  if (WRONG[w]) return [...WRONG[w]]
  const out = []
  if (w.length > 4 && w.endsWith('ing')) {
    let stem = w.slice(0, -3)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) stem = stem.slice(0, -1) // running → run
    out.push(stem)
  } else if (w.length > 4 && w.endsWith('ed')) out.push(w.slice(0, -2).replace(/([b-df-hj-np-tv-z])\1$/, '$1'))
  else if (w.length >= 5 && w.endsWith('s') && !/(ss|us|is)$/.test(w) && !NO_S.has(w)) out.push(w.slice(0, -1))
  return out.filter(x => x.length > 1 && x !== w)
}

const withCase = (orig, w) => (orig[0] === orig[0]?.toUpperCase() && /[A-Za-z]/.test(orig[0]) ? w[0].toUpperCase() + w.slice(1) : w)

/** Ошибочные ФРАЗЫ из эталона: каждое слово по очереди заменяем на ученическую ошибку («I'm trying» → «I'm try, I'm tried, I'm tries») */
export function generateWrongForms(reference, limit = 12) {
  const words = String(reference ?? '').trim().split(/\s+/).filter(Boolean)
  const out = []
  words.forEach((orig, i) => {
    for (const bad of wrongFormsOfWord(orig)) {
      const phrase = words.map((x, j) => (j === i ? withCase(orig, bad) + (orig.match(/[.,!?;:]+$/)?.[0] ?? '') : x)).join(' ')
      if (!out.includes(phrase)) out.push(phrase)
    }
  })
  return out.slice(0, limit)
}

/** Слова эталона, для которых есть ошибочные формы (кнопки «одно слово»): ['trying'] */
export function keyWordsOf(reference) {
  const seen = new Set()
  return String(reference ?? '').split(/\s+/).map(coreOf).filter(w => w && wrongFormsOfWord(w).length && !seen.has(w) && seen.add(w))
}

/** Поле «ошибочные формы» → список фраз (запятая/точка с запятой/перенос), без пустых, дублей и самого эталона */
export function parseWrongList(text, reference = '') {
  const ref = tokenize(reference).join(' ')
  const out = []
  for (const part of String(text ?? '').split(/[,;\n]+/)) {
    const p = part.trim()
    if (p && !out.includes(p) && tokenize(p).join(' ') !== ref) out.push(p)
  }
  return out
}

// ---- грамматики ----
const clean = s => String(s ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
const uniq = a => [...new Set(a.filter(Boolean))]

/** JSGF для SpeechGrammarList: эталон и ошибочные формы — равноправные варианты */
export function buildJsgf(reference, wrongPhrases) {
  return `#JSGF V1.0; grammar g; public <p> = ${uniq([reference, ...wrongPhrases].map(clean)).join(' | ')};`
}

/** Закрытый словарь для Vosk (JSON-массив фраз): и «i'm try», и «i am try», плюс [unk] для всего постороннего */
export function buildVoskGrammar(reference, wrongPhrases) {
  const all = [reference, ...wrongPhrases].flatMap(p => [clean(p), tokenize(p).join(' ')])
  return JSON.stringify([...uniq(all), '[unk]'])
}

// ---- настройка распознавателя ----
/** Что реально лежит в распознавателе после настройки (читаем обратно: честнее, чем «что хотели выставить») */
export function describeApplied(rec, skipped = []) {
  return {
    lang: rec.lang ?? null, maxAlternatives: rec.maxAlternatives ?? null, continuous: rec.continuous === true,
    processLocally: 'processLocally' in rec ? rec.processLocally === true : null,
    phrases: rec.phrases && typeof rec.phrases.length === 'number' ? rec.phrases.length : null,
    grammars: rec.grammars && typeof rec.grammars.length === 'number' ? rec.grammars.length : null,
    skipped,
  }
}

/**
 * configure-хук speechController: ctx.extra = { settings (уже отфильтрованы по устройству), wrong: string[] фраз } из снимка в момент тапа.
 * Ничего не выставляет, если режимы выключены — тогда поведение пробы прежнее. Возвращает описание применённого (view.applied)
 */
export function configureRecognition(rec, ctx, win = globalThis.window) {
  const { settings: s = DEFAULT_SETTINGS, wrong = [] } = ctx.extra || {}
  const skipped = []
  const attempt = (name, fn) => { try { fn() } catch (e) { skipped.push(`${name}: ${e?.message || e}`) } }
  if (s.lang) rec.lang = s.lang
  if (s.alts) rec.maxAlternatives = MAX_ALTS
  if (s.words) rec.continuous = true
  if (s.local) attempt('processLocally', () => { rec.processLocally = true })
  if (s.phrases) {
    attempt('phrases', () => {
      const list = uniq([ctx.reference, ...wrong]).map(p => new win.SpeechRecognitionPhrase(p, BOOST))
      try { rec.phrases = list } catch { for (const p of list) rec.phrases.push(p) }
    })
  }
  if (s.grammar) {
    attempt('grammars', () => {
      const List = win.SpeechGrammarList || win.webkitSpeechGrammarList
      const list = new List()
      list.addFromString(buildJsgf(ctx.reference, wrong), 1)
      rec.grammars = list
    })
  }
  return describeApplied(rec, skipped)
}
