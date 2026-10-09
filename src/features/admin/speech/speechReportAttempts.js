// Тексты попыток для журнала пробы «Голос» и отчётов («Скопировать отчёт», «Скопировать все сравнения»). Только локально:
// в localStorage журнала и в буфер обмена, на сервер ничего не уходит. Чистые функции.
// Запись `tx` в журнале — компактный снимок попытки: эталон, «что я сказал», top-1 + N-best с уверенностью, последний interim,
// история interim (≤ 12, самые «изменчивые»), изменения между соседними текстами, где встретилась ошибочная форма, вердикты правил.
import { saidKind, judge } from './antiPredictRules.js'
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'
import { buildChain } from './attemptDiff.js'

export const TX_LIMITS = { ref: 120, said: 80, text: 90, alt: 90, nAlts: 10, nHist: 12, nChanges: 6, nLiteral: 6 }
export const REPORT_ATTEMPTS = 12 // сколько попыток в блоке отчёта
export const ALL_ATTEMPTS = 10    // сколько попыток в «Скопировать все сравнения»
export const ALL_MAX_CHARS = 6000 // потолок «Скопировать все сравнения» (чтобы чат не обрезал)

const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const pct = c => (typeof c === 'number' ? Math.round(c * 100) : null)
const sec = t => (typeof t === 'number' ? `${(t / 1000).toFixed(1)}s` : '?s')

// Текст «вырос» (дописали слова в конец, прежние слова не тронуты) — обычный ход речи; иначе слово менялось
const isGrowth = (prev, text) => {
  const p = tokenize(prev)
  const t = tokenize(text)
  return p.length <= t.length && p.every((w, i) => w === t[i])
}

/** Какие тексты (с полем text) оставить, если их больше max: первый, последний и те, где текст «менялся» (не просто рос), остальное — самые поздние */
export function thinTexts(list, max = TX_LIMITS.nHist) {
  if (list.length <= max) return list
  const keep = new Set([0, list.length - 1])
  for (let i = list.length - 1; i > 0 && keep.size < max; i--) {
    if (isGrowth(list[i - 1].text, list[i].text)) continue
    keep.add(i)
    if (keep.size < max) keep.add(i - 1)
  }
  for (let i = list.length - 2; i > 0 && keep.size < max; i--) keep.add(i)
  return [...keep].sort((x, y) => x - y).map(i => list[i])
}

/** Запись `tx` для журнала. an — результат analyzeAttempt (null — итога нет). Нет вообще никаких текстов → null */
export function buildAttemptTexts(view, extra, an) {
  const chain = buildChain({ history: view.history ?? [], final: view.final, lastInterim: view.lastInterim })
  if (!an && !chain.length) return null
  const hist = chain.filter(c => !c.final)
  const picked = thinTexts(chain)
  const kind = saidKind(extra?.said, an)
  return {
    ref: cut(view.reference, TX_LIMITS.ref), said: cut(extra?.said, TX_LIMITS.said), lang: view.applied?.lang ?? view.lang,
    modes: extra?.modes ?? [], series: extra?.series ? { step: extra.series.step, wrongPhrase: cut(extra.series.wrongPhrase, TX_LIMITS.ref) } : null,
    top1: an ? { text: cut(view.final.text, TX_LIMITS.text), conf: pct(view.final.confidence) } : null,
    alts: an ? an.nbest.slice(0, TX_LIMITS.nAlts).map(a => ({ text: cut(a.text, TX_LIMITS.alt), conf: pct(a.confidence) })) : [],
    lastInterim: cut(view.lastInterim, TX_LIMITS.text), histN: hist.length,
    hist: picked.map(c => ({ t: c.t, text: cut(c.text, TX_LIMITS.alt), ...(c.final ? { final: true } : {}) })),
    changes: (an?.changes ?? []).slice(-TX_LIMITS.nChanges).map(c => ({ kind: c.kind, from: c.from ?? null, to: c.to ?? null, at: c.at, step: c.step })),
    literal: (an?.places ?? []).slice(0, TX_LIMITS.nLiteral).map(p => (p.at === 'interim' ? `interim@${sec(p.t)}` : p.at)),
    verdicts: an ? { top1: an.verdicts.top1.ok, consensus: an.verdicts.consensus.ok, strict: an.verdicts.strict.ok } : null,
    saidKind: kind, fixed: an ? an.engineFixed : null, dir: an?.diff.dir ?? null,
  }
}

const quote = s => `«${s}»`
const confTxt = c => (c == null ? '' : ` ${c}%`)

/** Слово вердикта: известно, что говорили → «поймало/пропустило», иначе просто «подтв./НЕ подтв.» */
export function verdictWord(kind, ok) {
  const j = judge(kind, ok)
  if (!j) return ok ? 'подтв.' : 'НЕ подтв.'
  return j.label.replace(' ошибку', '')
}

/** Изменения между соседними текстами: «try→trying (interim→final); +to please (конец)»; пусто → причина */
export function changesText(tx) {
  const parts = (tx.changes ?? []).map(c => {
    if (c.kind === 'replace') return `${c.from}→${c.to} (${c.step})`
    if (c.kind === 'append') return `+${c.to} (конец)`
    return c.kind === 'insert' ? `+${c.to} (вставка, ${c.step})` : `−${c.from} (${c.step})`
  })
  if (parts.length) return parts.join('; ')
  return tx.histN ? 'нет изменений' : 'interim не было'
}

/** Поля попытки для таблицы журнала и отчёта: [ключ, подпись, текст]. histMax — сколько записей interim показать (0 — не показывать) */
export function attemptFields(e, histMax = TX_LIMITS.nHist) {
  const tx = e.tx
  if (!tx) return []
  const alts = (tx.alts ?? []).slice(tx.top1 && tx.alts?.[0]?.text === tx.top1.text ? 1 : 0)
  let hist = tx.hist ?? []
  if (histMax <= 0) hist = []
  else if (hist.length > histMax) hist = thinTexts(hist, histMax)
  const v = tx.verdicts
  return [
    ['ref', 'эталон', `ref=${quote(tx.ref)}`],
    ['said', 'сказал', `said=${tx.said ? quote(tx.said) : '—'}`],
    ['lang', 'язык', tx.lang || '?'],
    ['modes', 'режимы', tx.modes?.length ? tx.modes.join('+') : 'обычный'],
    ['top1', 'итог top-1', tx.top1 ? `top1=${quote(tx.top1.text)}${confTxt(tx.top1.conf)}` : 'top1=нет итога'],
    ['alts', 'N-best', `alts=${alts.length ? alts.map(a => `${quote(a.text)}${a.conf == null ? '' : ` ${a.conf}`}`).join(' · ') : 'нет'}`],
    ['hist', 'interim', `interim-история: ${hist.length ? hist.map(h => `${sec(h.t)} ${quote(h.text)}${h.final ? ' [final]' : ''}`).join(' → ') : tx.histN ? `${tx.histN} шт.` : 'нет'}`],
    ['diff', 'изменения', `final-vs-interim: ${changesText(tx)}`],
    ['lit', 'литерально', tx.literal?.length ? `литерально: ${tx.literal.join(', ')}` : ''],
    ['verd', 'вердикты', v ? `вердикты: top1=${verdictWord(tx.saidKind, v.top1)} consensus=${verdictWord(tx.saidKind, v.consensus)} strict=${verdictWord(tx.saidKind, v.strict)}` : 'вердиктов нет'],
  ]
}

/** Одна строка попытки в компактном формате отчёта */
export function attemptLine(e, histMax = TX_LIMITS.nHist) {
  const no = `№${e.run ?? '?'}${e.retry ? `.${e.retry + 1}` : ''}`
  return [no, ...attemptFields(e, histMax).filter(f => f[2]).map(f => f[2])].join(' | ')
}

const hasTexts = e => !!e?.tx

/** Блок «ПОПЫТКИ С ТЕКСТАМИ (последние N)»; пусто — строка-пояснение */
export function attemptsBlock(log, { limit = REPORT_ATTEMPTS, histMax = TX_LIMITS.nHist } = {}) {
  const list = log.filter(hasTexts).slice(0, limit)
  const head = `ПОПЫТКИ С ТЕКСТАМИ (последние ${list.length || limit})`
  return list.length ? [head, ...list.map(e => attemptLine(e, histMax))] : [head, 'Попыток с текстами пока нет (записываются начиная с этой версии).']
}

/**
 * «Скопировать все сравнения»: последние ALL_ATTEMPTS попыток с текстами + итог серии (seriesLines — готовые строки) в один текст
 * не длиннее maxChars. Не влезло: сначала прореживаем interim-историю (12 → 6 → 3 → 0 записей), затем выкидываем самые старые попытки.
 */
export function allComparisonsText({ log, seriesLines = [], head = [], maxChars = ALL_MAX_CHARS }) {
  const all = log.filter(hasTexts).slice(0, ALL_ATTEMPTS)
  const build = (n, histMax) => [
    ...head, '',
    `ПОПЫТКИ С ТЕКСТАМИ (последние ${n})`,
    ...(n ? all.slice(0, n).map(e => attemptLine(e, histMax)) : ['попыток с текстами нет']),
    ...(seriesLines.length ? ['', ...seriesLines] : []),
  ].join('\n')
  for (const histMax of [12, 6, 3, 0]) {
    const text = build(all.length, histMax)
    if (text.length <= maxChars) return text
  }
  for (let n = all.length - 1; n >= 0; n--) {
    const text = build(n, 0)
    if (text.length <= maxChars) return text
  }
  return build(0, 0).slice(0, maxChars)
}
