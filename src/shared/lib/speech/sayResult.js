// Правила результата модуля «Сказать фразу» (v1, без БД) и аналитика. Чистые функции, без React.
// Речь — тренировка, а не экзамен: модуль НИКОГДА не штрафует (нет «ошибки», не меняет звёзды урока), для памяти слов
// (word_memory) в v1 ничего не пишем. Что засчитываем:
//  - прошёл с 1–2 нажатия, без автоповторов                 → success, clean (метка «чисто», бонусов в v1 нет)
//  - прошёл с 3 нажатия или после автоповторов связи         → success без метки
//  - «Получилось» (ученик сказал вслух и подтвердил сам)      → success без метки
//  - «Не могу говорить» / пропуск / 3 неудачи без «Получилось» → skipped: урок идёт дальше, XP нет, штрафа нет
import { matchBest, tokenize } from './speechMatch.js'

export const MAX_TAPS = 3        // нажатий на микрофон на одну ноду; дальше «Ещё раз» скрыт, остаются «Получилось» и «Не могу говорить»
export const CLEAN_TAPS = 2      // пройти с этого нажатия или раньше — «чисто»
export const TRIGGER_DONE = 'say_done'
export const TRIGGER_SKIP = 'say_skip'

/**
 * kind: 'passed' (проверка прошла) | 'self_ok' («Получилось») | 'skip' («Не могу говорить» / пропуск)
 * hasSkipLink — у ноды соединён выход «Не могу говорить» (иначе пропуск идёт по основному выходу, урок не встаёт)
 */
export function sayOutcome({ kind, taps = 1, autoRetries = 0, hasSkipLink = false }) {
  if (kind === 'skip') {
    return { result: 'skipped', success: false, clean: false, penalty: false, trigger: hasSkipLink ? TRIGGER_SKIP : TRIGGER_DONE }
  }
  const clean = kind === 'passed' && taps <= CLEAN_TAPS && autoRetries === 0
  return { result: 'success', success: true, clean, penalty: false, trigger: TRIGGER_DONE }
}

/** Сравнение услышанного (все альтернативы распознавания) с эталоном ноды; data — результат readSayData */
export function judgeRun(view, data) {
  const alts = (view?.alternatives?.length ? view.alternatives : view?.final ? [view.final] : [])
    .map(a => a.text).filter(Boolean)
  const m = matchBest(data.phrase, alts, data.keywords, data.passRatio)
  return { ...m, ratioPct: Math.round(m.ratio * 100), heard: m.text ?? '' }
}

/**
 * Слова фразы для показа (как написал автор: регистр, знаки) с тоном: 'ok' — услышано, 'miss' — пропущено,
 * null — ещё не проверяли (или в слове нет букв). Слово из нескольких токенов («I'm» = i + am) — ok, только если услышаны все
 */
export function phraseWords(phrase, verdict) {
  let at = 0
  return String(phrase ?? '').split(/\s+/).filter(Boolean).map(text => {
    const n = tokenize(text).length
    const items = verdict ? verdict.items.slice(at, at + n) : []
    at += n
    const tone = !verdict || !n ? null : items.every(it => it.ok) ? 'ok' : 'miss'
    return { text, tone }
  })
}

/** Свойства события аналитики. Только числа/строки/булевы — текста фразы и звука здесь нет */
export function sayEventProps({ perm, explained, taps, autoRetries, passed, ratioPct, reason, clean }) {
  const p = {}
  if (perm != null) p.perm = perm
  if (explained != null) p.explainer_shown = !!explained
  if (taps != null) p.attempts = taps
  if (autoRetries) p.auto_retries = autoRetries
  if (passed != null) p.passed = !!passed
  if (ratioPct != null) p.ratio = ratioPct
  if (clean != null) p.clean = !!clean
  if (reason) p.reason = reason
  return p
}

export const SAY_EVENTS = {
  start: 'say_phrase_start', result: 'say_phrase_result', skip: 'say_phrase_skip', selfOk: 'say_phrase_self_ok',
}
