// Серия «влияет ли длина контекста» (проба «Голос», эксперименты против домысливания). Один и тот же ошибочный слово-форма
// («try» вместо «trying») говорится в 4 эталонах разной длины: «trying» → «I'm trying» → «I'm trying to please» → «I'm trying to please both».
// Результаты каждого прогона складываются в таблицу «длина контекста → top-1 → буквально/исправлено → уверенность → вердикты правил»,
// отдельно по каждому языку (en-US, en-GB…), чтобы сравнить. Хранится в localStorage этого устройства. Чистые функции без React.
import { judge } from './antiPredictRules.js'
import { plainVerdict } from './seriesCards.js'
import { DWELL_DEFAULT, unpackForms, flashText } from '../../../shared/lib/speech/flashDwell.js'

export const SERIES_KEY = 'pithy_admin_voice_series_v1'
export const DEFAULT_WORD = 'trying'
export const DEFAULT_WRONG = 'try'
export const DEFAULT_REFS = ['trying', "I'm trying", "I'm trying to please", "I'm trying to please both"]

export const MAX_RUNS = 120 // сколько последних прогонов хранить для таблицы порогов (controlSeries.js)

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
// Состояние: cfg — эталоны; langs — последние результаты шагов режима «с ошибкой», control — то же для «контроля» (говорю правильно), оба по языкам;
// runs — все прогоны (режим, язык, шаг, мелькание ошибочной формы) для таблицы порогов; mode — выбранный режим
export const emptyState = () => ({ cfg: defaultConfig(), langs: {}, control: {}, runs: [], mode: 'errors' })

const bucketOf = (state, mode) => (mode === 'control' ? state.control : state.langs) ?? {}
const cleanLangs = raw => {
  const langs = {}
  for (const [lang, rows] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!rows || typeof rows !== 'object') continue
    langs[lang] = Object.fromEntries(Object.entries(rows).filter(([k, r]) => /^[0-3]$/.test(k) && r && typeof r === 'object'))
  }
  return langs
}
const cleanRuns = raw => (Array.isArray(raw) ? raw : [])
  .filter(r => r && (r.mode === 'errors' || r.mode === 'control') && typeof r.lang === 'string' && Array.isArray(r.forms))
  .slice(-MAX_RUNS).map(r => ({ mode: r.mode, lang: r.lang.slice(0, 12), step: Number(r.step) || 0, t: Number(r.t) || 0, forms: r.forms.filter(Array.isArray).slice(0, 3) }))

export function sanitizeState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const c = o.cfg && typeof o.cfg === 'object' ? o.cfg : {}
  const def = defaultConfig()
  const refs = Array.isArray(c.refs) && c.refs.length === 4 ? c.refs.map(r => String(r ?? '').slice(0, 120)) : def.refs
  return {
    cfg: { word: String(c.word || def.word).slice(0, 40), wrong: String(c.wrong || def.wrong).slice(0, 40), refs },
    langs: cleanLangs(o.langs), control: cleanLangs(o.control), runs: cleanRuns(o.runs), mode: o.mode === 'control' ? 'control' : 'errors',
  }
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
  const mode = tx.series.mode === 'control' ? 'control' : 'errors'
  return {
    step: tx.series.step, mode, ref: tx.ref, n: wordCount(tx.ref), said: tx.said || (mode === 'control' ? tx.ref : tx.series.wrongPhrase) || '',
    flash: Array.isArray(tx.flash) ? { forms: tx.flash, d: tx.first?.dwell ?? DWELL_DEFAULT } : null, // мелькание ошибочной формы в interim + порог правила в момент попытки
    chg: (tx.changes ?? []).filter(c => c.kind === 'replace').slice(0, 4).map(c => `${c.from}→${c.to}`),
    top1: tx.top1.text, conf: tx.top1.conf, kind, fixed: tx.fixed === true, reverse: tx.dir === 'fromRef',
    verdicts: tx.verdicts ?? null, literal: tx.literal ?? [], alts: (tx.alts ?? []).slice(1, 4).map(a => `${a.text} ${a.conf ?? '?'}`), hist: (tx.hist ?? []).slice(0, 8), t: entry.t,
    snd: typeof entry.audioBefore === 'string' ? entry.audioBefore || 'нет' : null, ses: entry.audioSession ?? null, // что играла страница за 6 с до записи / тип audioSession (soundLog.js)
  }
}

/** Новое состояние с результатом попытки (последний прогон шага заменяет прежний; в runs копится каждый прогон). Не серия / нет итога — состояние без изменений */
export function recordEntry(state, entry) {
  const row = buildRow(entry)
  if (!row) return state
  const lang = entry.tx.lang || '?'
  const key = row.mode === 'control' ? 'control' : 'langs'
  const run = row.flash ? [{ mode: row.mode, lang, step: row.step, t: entry.t, forms: row.flash.forms }] : []
  return { ...state, [key]: { ...state[key], [lang]: { ...state[key]?.[lang], [row.step]: row } }, runs: [...(state.runs ?? []), ...run].slice(-MAX_RUNS) }
}

export function clearLang(state, lang) {
  const drop = b => Object.fromEntries(Object.entries(b ?? {}).filter(([l]) => l !== lang))
  return { ...state, langs: drop(state.langs), control: drop(state.control), runs: (state.runs ?? []).filter(r => r.lang !== lang) }
}

/** Строки таблицы языка по возрастанию длины контекста (mode: 'errors' — по умолчанию | 'control') */
export const rowsOf = (state, lang, mode = 'errors') => Object.values(bucketOf(state, mode)[lang] ?? {}).sort((a, b) => a.n - b.n || a.step - b.step)

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

/** Правила одной строки: «top1=пропустило consensus=поймало strict=поймало first=поймало» (first — «первое увиденное»; в старых записях нет) */
export const rulesText = v => (v ? `top1=${ruleWord(v.top1)} consensus=${ruleWord(v.consensus)} strict=${ruleWord(v.strict)}${v.first == null ? '' : ` first=${ruleWord(v.first)}`}` : 'нет данных')

const mark = f => (f ? `\n    ошибочная форма ${flashText(unpackForms(f.forms))} (порог ${f.d} мс)` : '')

/** Строки одного режима («errors» — говорили с ошибкой, «control» — говорили правильно) по языкам: «Услышали» + «мелькала форма…»; detail — ещё звуки, правила и выводы */
export function modeLines(state, langs, mode = 'errors', detail = true) {
  const have = langs.filter(l => rowsOf(state, l, mode).length)
  if (!have.length) return ['результатов пока нет']
  const out = []
  for (const lang of have) {
    const rows = rowsOf(state, lang, mode)
    out.push(`${lang}:`)
    for (const r of rows) {
      out.push(`  Шаг ${r.step + 1} · Услышали: «${r.top1}»${r.conf != null ? ` (${r.conf}%)` : ''} — ${plainVerdict(r, state.cfg).text}${mark(r.flash)}`)
      if (!detail) continue
      if (r.snd != null) out.push(`    звуки до записи: ${r.snd}${r.ses ? ` | аудиосессия: ${r.ses}` : ''}`)
      out.push(`    ${r.n} сл. | ref=«${r.ref}» said=«${r.said}» | top1=«${r.top1}» ${r.conf ?? '?'}% ${KIND_LABEL[r.kind]}${r.fixed ? ' (interim исправлен)' : ''} | ${rulesText(r.verdicts)} | литерально: ${r.literal.length ? r.literal.join(', ') : 'нет'}${r.alts.length ? ` | alts: ${r.alts.join(' · ')}` : ''}${r.chg?.length ? ` | замены: ${r.chg.join(', ')}` : ''}`)
    }
    if (detail && mode === 'errors') out.push(...conclusions(rows).map(c => `  > ${c}`))
  }
  return out
}

/** Текст итога режима «с ошибкой»: таблица каждого языка с данными + выводы + сравнение языков (полный итог обоих режимов — controlSeries.js) */
export function seriesLines(state, langs = Object.keys(state.langs)) {
  const have = langs.filter(l => rowsOf(state, l).length)
  const out = [`СЕРИЯ «длина контекста»: слово ${state.cfg.word}, говорим «${state.cfg.wrong}»`, ...modeLines(state, langs, 'errors')]
  if (have.length > 1) {
    const start = l => rowsOf(state, l).find(r => r.kind === 'ref')?.n
    out.push(`Сравнение: ${have.map(l => `${l} — исправление ${start(l) ? `с ${start(l)} сл.` : 'нет'}`).join('; ')}`)
  }
  return out
}
