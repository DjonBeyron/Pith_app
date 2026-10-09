// Подсказки «Сказать фразу» в ЧАТ после неудачной попытки: какой это тип неудачи, подстановка слов в шаблон и тайминг. Чистые
// функции, без React. Подсказки приходят текстовыми пузырями слева (от ведущего, как реплики «Собери фразу»); тексты — поля ноды
// hintSilence / hintMismatch / hintPartial (sayPhraseData.js, умолчания — sayTexts.js), все разом отключаются hintsOn=false.
// В шаблоне «почти получилось» работают подстановки {ok} (верно произнесённые слова эталона) и {missed} (не произнесённые/неверные).
import { failReason } from './sayResult.js'
import { HINT_FALLBACK, HINT_DEFAULTS } from './sayTexts.js'

export const QUIET_TAIL_MS = 600          // звуки приложения молчат ещё столько после показа результата (хвост системного сигнала конца записи)
export const HINT_DELAY_MS = QUIET_TAIL_MS + 60 // пузырь подсказки приходит ПОСЛЕ окна тишины: его звук «новое сообщение» уже не подавляется

// Ошибки движка, которые лечит пользователь действием (занят микрофон, выключена диктовка, язык): текстовой подсказки нет
const NO_HINT_CODES = new Set(['audio-capture', 'service-not-allowed', 'language-not-supported'])

/**
 * Тип подсказки по итогу неудачной попытки: 'silence' (не слышу: тишина, сеть, запись не началась) | 'mismatch' (не то) |
 * 'partial' (почти получилось) | null (подсказки нет: успех или системная ошибка, требующая действия пользователя)
 */
export function hintKind({ errorCode = null, verdict = null } = {}) {
  const r = failReason({ errorCode, verdict })
  if (!r) return null
  if (r === 'partial' || r === 'mismatch') return r
  return NO_HINT_CODES.has(r) ? null : 'silence'
}

const uniq = list => [...new Set(list ?? [])]

// Слова сравнения — нормализованные (нижний регистр, «I'm» → i, am). Для подсказки возвращаем написание из фразы автора, где оно есть
// («I», имена, «London»); раскрытые сокращения остаются строчными, одинокое «i» — «I»
function spelled(tokens, phrase) {
  const orig = new Map()
  for (const w of String(phrase ?? '').split(/\s+/)) {
    const clean = w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '')
    if (clean && !orig.has(clean.toLowerCase())) orig.set(clean.toLowerCase(), clean)
  }
  return (tokens ?? []).map(t => orig.get(t) ?? (t === 'i' ? 'I' : t))
}
const SENTENCES = /[^.!?…]+[.!?…]*\s*/g

/**
 * Подставить {ok} и {missed} (слова через запятую). Если списка нет (например, ничего не угадано), предложение шаблона, где стоит
 * пустая подстановка, выпадает целиком: «Почти! Верно: {ok}. Не хватило: {missed}.» без верных слов → «Почти! Не хватило: …».
 */
export function fillHint(template, { ok = [], missed = [] } = {}) {
  const vars = { ok: uniq(ok).join(', '), missed: uniq(missed).join(', ') }
  const src = String(template ?? '')
  const kept = (src.match(SENTENCES) ?? [src]).filter(part => !Object.keys(vars).some(k => !vars[k] && part.includes(`{${k}}`)))
  return kept.join('').replace(/\{(ok|missed)\}/g, (_, k) => vars[k]).replace(/\s+/g, ' ').trim()
}

/**
 * Подсказка для чата или null. data — readSayData (hintsOn, hintSilence, hintMismatch, hintPartial); verdict — итог сравнения
 * (matched → {ok}, missed → {missed}). @returns {{kind: 'silence'|'mismatch'|'partial', text: string}|null}
 */
export function buildHint(data, { errorCode = null, verdict = null } = {}) {
  if (!data || data.hintsOn === false) return null
  const kind = hintKind({ errorCode, verdict })
  if (!kind) return null
  const words = { ok: spelled(verdict?.matched, data.phrase), missed: spelled(verdict?.missed, data.phrase) }
  const template = data[{ silence: 'hintSilence', mismatch: 'hintMismatch', partial: 'hintPartial' }[kind]] || HINT_DEFAULTS[kind]
  const text = fillHint(template, words) || (kind === 'partial' ? fillHint(HINT_DEFAULTS.partial, words) || HINT_FALLBACK : HINT_DEFAULTS[kind])
  return { kind, text }
}
