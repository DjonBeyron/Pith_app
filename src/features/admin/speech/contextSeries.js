// Серия «влияет ли длина контекста» (проба «Голос», эксперименты против домысливания). Один и тот же ошибочный слово-форма
// («try» вместо «trying») говорится в 4 эталонах разной длины: «trying» → «I'm trying» → «I'm trying to please» → «I'm trying to please both».
// Результаты каждого прогона складываются в таблицу «длина контекста → top-1 → буквально/исправлено → уверенность → вердикты правил»,
// отдельно по каждому языку (en-US, en-GB…), чтобы сравнить. Хранится в localStorage этого устройства. Чистые функции без React.
import { judge } from './antiPredictRules.js'

export const SERIES_KEY = 'pithy_admin_voice_series_v1'
export const DEFAULT_WORD = 'trying'
export const DEFAULT_WRONG = 'try'
export const DEFAULT_REFS = ['trying', "I'm trying", "I'm trying to please", "I'm trying to please both"]

export const KIND_LABEL = { wrong: 'буквально', ref: 'исправлено', other: 'иначе' }

export const defaultConfig = () => ({ word: DEFAULT_WORD, wrong: DEFAULT_WRONG, refs: [...DEFAULT_REFS] })

export const wordCount = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).length

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Эталон с ключевым словом, заменённым на ошибочную форму: («I'm trying», trying, try) → «I'm try». Слова в эталоне нет → null */
export function wrongPhrase(ref, word, wrong) {
  if (!word || !wrong) return null
  const re = new RegExp(`(^|[^A-Za-z'])${escapeRe(word)}(?![A-Za-z'])`, 'i')
  return re.test(ref) ? ref.replace(re, (_, pre) => pre + wrong) : null
}

/** Подпись шага: «скажи: «I'm try» (с ошибкой try)» */
export const stepCaption = (cfg, i) => {
  const ph = wrongPhrase(cfg.refs[i], cfg.word, cfg.wrong)
  return ph ? `скажи: «${ph}» (с ошибкой ${cfg.wrong})` : `в эталоне нет слова «${cfg.word}» — шаг не годится`
}

/** Замена ключевого слова во всех эталонах серии (словом, которое пользователь ввёл вместо trying) */
export function replaceWord(cfg, word, wrong) {
  const w = word.trim()
  const bad = wrong.trim()
  if (!w || !bad) return cfg
  const swap = r => {
    const re = new RegExp(`(^|[^A-Za-z'])${escapeRe(cfg.word)}(?![A-Za-z'])`, 'gi')
    return r.replace(re, (_, pre) => pre + w)
  }
  return { word: w, wrong: bad, refs: cfg.refs.map(swap) }
}

// ---- хранение ----
export const emptyState = () => ({ cfg: defaultConfig(), langs: {} })

export function sanitizeState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const c = o.cfg && typeof o.cfg === 'object' ? o.cfg : {}
  const def = defaultConfig()
  const refs = Array.isArray(c.refs) && c.refs.length === 4 ? c.refs.map(r => String(r ?? '').slice(0, 120)) : def.refs
  const langs = {}
  for (const [lang, rows] of Object.entries(o.langs && typeof o.langs === 'object' ? o.langs : {})) {
    if (!rows || typeof rows !== 'object') continue
    langs[lang] = Object.fromEntries(Object.entries(rows).filter(([k, r]) => /^[0-3]$/.test(k) && r && typeof r === 'object'))
  }
  return { cfg: { word: String(c.word || def.word).slice(0, 40), wrong: String(c.wrong || def.wrong).slice(0, 40), refs }, langs }
}

export function readState(store = globalThis.localStorage) {
  try { return sanitizeState(JSON.parse(store.getItem(SERIES_KEY))) } catch { return emptyState() }
}

export function writeState(state, store = globalThis.localStorage) {
  try { store.setItem(SERIES_KEY, JSON.stringify(state)) } catch { /* приватный режим — серия живёт до перезагрузки */ }
}

// ---- результаты ----
/** Строка таблицы из записи журнала (entry.tx.series задан и итог был); иначе null */
export function buildRow(entry) {
  const tx = entry?.tx
  if (!tx?.series || !tx.top1) return null
  const literalTop = (tx.literal ?? []).includes('top1')
  const kind = literalTop ? 'wrong' : tx.verdicts?.top1 ? 'ref' : 'other'
  return {
    step: tx.series.step, ref: tx.ref, n: wordCount(tx.ref), said: tx.said || tx.series.wrongPhrase || '',
    top1: tx.top1.text, conf: tx.top1.conf, kind, fixed: tx.fixed === true, reverse: tx.dir === 'fromRef',
    verdicts: tx.verdicts ?? null, literal: tx.literal ?? [], alts: (tx.alts ?? []).slice(1, 4).map(a => `${a.text} ${a.conf ?? '?'}`), t: entry.t,
  }
}

/** Новое состояние с результатом попытки (последний прогон шага заменяет прежний). Не серия / нет итога — состояние без изменений */
export function recordEntry(state, entry) {
  const row = buildRow(entry)
  if (!row) return state
  const lang = entry.tx.lang || '?'
  return { ...state, langs: { ...state.langs, [lang]: { ...state.langs[lang], [row.step]: row } } }
}

export function clearLang(state, lang) {
  const langs = { ...state.langs }
  delete langs[lang]
  return { ...state, langs }
}

/** Строки таблицы языка по возрастанию длины контекста */
export const rowsOf = (state, lang) => Object.values(state.langs[lang] ?? {}).sort((a, b) => a.n - b.n || a.step - b.step)

const range = list => (list.length ? (Math.min(...list) === Math.max(...list) ? `${list[0]}%` : `${Math.min(...list)}–${Math.max(...list)}%`) : '—')
const confs = rows => rows.map(r => r.conf).filter(c => typeof c === 'number')

/** Выводы по строкам одного языка: с какой длины начинается исправление, зависит ли от уверенности, где ещё видна ошибочная форма */
export function conclusions(rows) {
  if (!rows.length) return ['Данных нет — пройдите шаги серии.']
  const out = []
  const first = rows.find(r => r.kind === 'ref')
  if (!first) out.push(`Исправления не было ни при одной длине контекста (${rows.map(r => r.n).join(', ')} сл.): top-1 буквальный или иной.`)
  else if (first === rows[0]) out.push(`Исправление уже при самом коротком контексте (${first.n} сл.).`)
  else out.push(`Исправление начинается с ${first.n} сл.; до этого (${rows.filter(r => r.n < first.n).map(r => r.n).join(', ')} сл.) движок писал сказанное буквально.`)
  if (first && rows.some(r => r.n > first.n && r.kind === 'wrong')) out.push('Не монотонно: при более длинном контексте снова буквально.')
  const w = confs(rows.filter(r => r.kind === 'wrong'))
  const r = confs(rows.filter(r2 => r2.kind === 'ref'))
  if (w.length && r.length) {
    out.push(`Уверенность: буквальные ${range(w)}, исправленные ${range(r)} — ${Math.max(...w) < Math.min(...r) ? 'ЗАВИСИТ (исправленная форма увереннее)' : 'чёткой границы нет'}.`)
  } else out.push('Зависимость от уверенности не оценить: нужны оба вида результатов (буквально и исправлено).')
  const hid = rows.filter(x => x.kind === 'ref' && x.literal.length)
  if (hid.length) out.push(`При исправленном top-1 ошибочная форма всё равно встречалась (${hid.map(x => `${x.n} сл.: ${x.literal.join(', ')}`).join('; ')}) — для строгой проверки смотреть N-best/interim.`)
  const fx = rows.filter(x => x.fixed)
  if (fx.length) out.push(`Исправление было видно в ходе речи (interim→interim/final) на: ${fx.map(x => `${x.n} сл.`).join(', ')}${fx.some(x => x.reverse) ? ' (есть обратное)' : ''}.`)
  return out
}

const ruleWord = ok => judge('wrong', ok)?.label.replace(' ошибку', '') ?? '?'

/** Правила одной строки: «top1=пропустило consensus=поймало strict=поймало» */
export const rulesText = v => (v ? `top1=${ruleWord(v.top1)} consensus=${ruleWord(v.consensus)} strict=${ruleWord(v.strict)}` : 'нет данных')

/** Текст «Скопировать итог серии»: таблица каждого языка с данными + выводы + сравнение языков */
export function seriesLines(state, langs = Object.keys(state.langs)) {
  const have = langs.filter(l => rowsOf(state, l).length)
  const out = [`СЕРИЯ «длина контекста»: слово ${state.cfg.word}, говорим «${state.cfg.wrong}»`]
  if (!have.length) return [...out, 'результатов пока нет']
  for (const lang of have) {
    const rows = rowsOf(state, lang)
    out.push(`${lang}:`)
    for (const r of rows) {
      out.push(`  ${r.n} сл. | ref=«${r.ref}» said=«${r.said}» | top1=«${r.top1}» ${r.conf ?? '?'}% ${KIND_LABEL[r.kind]}${r.fixed ? ' (interim исправлен)' : ''} | ${rulesText(r.verdicts)} | литерально: ${r.literal.length ? r.literal.join(', ') : 'нет'}${r.alts.length ? ` | alts: ${r.alts.join(' · ')}` : ''}`)
    }
    out.push(...conclusions(rows).map(c => `  > ${c}`))
  }
  if (have.length > 1) {
    const start = l => rowsOf(state, l).find(r => r.kind === 'ref')?.n
    out.push(`Сравнение: ${have.map(l => `${l} — исправление ${start(l) ? `с ${start(l)} сл.` : 'нет'}`).join('; ')}`)
  }
  return out
}
