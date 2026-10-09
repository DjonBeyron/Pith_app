// Простые формулировки для серий пробы «Голос» (карточки шагов серии «длина контекста» и живая строка «Слышу»): что услышал движок и что с этим стало,
// простыми словами, без терминов (interim, N-best, top-1 — только в «Подробнее»). Чистые функции без React; ничего не импортируют (на них опирается contextSeries.js).

export const NOT_SAID = 'ещё не говорили'
const q = s => `«${s}»`

/** Что сказать на шаге: «нужно было сказать: «I'm try»»; phrase — ошибочная фраза шага (null — ключевого слова нет в эталоне) */
export const stepAsk = (phrase, word) => (phrase ? `нужно было сказать: ${q(phrase)}` : `в эталоне нет слова ${q(word)}, шаг не годится`)

/** Заголовок карточки целиком: «Шаг 2 — нужно было сказать: «I'm try»» */
export const stepTitle = (i, phrase, word) => `Шаг ${i + 1} — ${stepAsk(phrase, word)}`

/** Главная строка карточки: «Услышали: «I'm trying»» или «ещё не говорили» */
export const heardLine = row => (row ? `Услышали: ${q(row.top1)}` : NOT_SAID)

/** Уверенность мелко: «уверенность 86%» (нет данных — пусто) */
export const confLine = row => (typeof row?.conf === 'number' ? `уверенность ${row.conf}%` : '')

/**
 * Вывод простыми словами по результату шага (kind/fixed из строки серии): { tone: 'ok'|'fixed'|'other'|'none', text }.
 * wrong — top-1 буквально как сказано; ref — движок выдал форму эталона вместо сказанной; other — что-то третье. cfg = { word, wrong }
 */
export function plainVerdict(row, cfg) {
  if (!row) return { tone: 'none', text: '' }
  if (row.kind === 'wrong') return { tone: 'ok', text: '✅ Движок записал как сказано' }
  if (row.kind === 'ref') return { tone: 'fixed', text: `⚠ Движок ИСПРАВИЛ: ${q(cfg.wrong)} → ${q(cfg.word)}${row.fixed ? ' (это было видно уже по ходу речи)' : ''}` }
  return { tone: 'other', text: `⚠ Движок выдал другое слово: ${q(row.top1)}` }
}

/** «Живая» строка рядом с кнопкой «Сказать» из view контроллера: идёт запись → «Слышу: «…»» (или «Слушаю…»), есть итог → «Услышали: «…»»; иначе null */
export function liveLine(view) {
  if (!view?.runNo) return null
  if (view.status === 'listening' || view.status === 'starting') return view.interim ? { tone: 'live', text: `Слышу: ${q(view.interim)}` } : { tone: 'wait', text: 'Слушаю… говорите' }
  if (view.final?.text) return { tone: 'final', text: `Услышали: ${q(view.final.text)}` }
  return null
}

/** «Языки рядом» простыми строками: «Шаг 2 · en-US: Услышали «I'm try» · en-GB: Услышали «I'm trying»» (по строке на шаг, где есть данные) */
export function compareLines(state, langs) {
  const out = []
  for (let i = 0; i < state.cfg.refs.length; i++) {
    const cells = langs.map(l => { const r = state.langs[l]?.[i]; return `${l}: ${r ? `Услышали ${q(r.top1)}` : NOT_SAID}` })
    if (langs.some(l => state.langs[l]?.[i])) out.push(`Шаг ${i + 1} · ${cells.join(' · ')}`)
  }
  return out
}

const secs = ms => (ms / 1000).toFixed(1)

/** Строки «Подробнее» для карточки: правила (готовая строка rules), где литерально, другие варианты, как менялся текст по ходу речи */
export function detailLines(row, rules) {
  if (!row) return []
  const out = [`Правила проверки: ${rules}`, `Где встретилась сказанная форма: ${row.literal?.length ? row.literal.join(', ') : 'нигде'}`]
  if (row.alts?.length) out.push(`Другие варианты движка: ${row.alts.join(' · ')}`)
  const hist = (row.hist ?? []).slice(0, 8)
  if (hist.length) out.push(`Как менялся текст по ходу речи: ${hist.map(h => `${secs(h.t)} с «${h.text}»${h.final ? ' (итог)' : ''}`).join(' → ')}`)
  return out
}
