// Правила результата модуля «Сказать фразу» (без БД) и аналитика. Чистые функции, без React.
// Речь — тренировка, а не экзамен: модуль НИКОГДА не штрафует (нет «ошибки», не меняет звёзды урока), для памяти слов
// (word_memory) ничего не пишем. У ноды два выхода: «верный» (say_done) и «неверный» (say_wrong). Что засчитываем:
//  - проверка пройдена (passed)                   → success: XP как у остальных заданий, пузырь ученика с эталоном, say_done
//  - три неудачные попытки (wrong)                 → wrong: урок идёт по say_wrong, XP нет, штрафа нет (sayFlow.MAX_ATTEMPTS)
//  - «Я не могу говорить» (skip)                  → skipped: ВСЕГДА выход «верный», но сообщение-успех сразу после модуля пропускается
//                                                    (итог say_cant, плеер переводит его сам — sayPairSkip.sayExit), XP нет, штрафа нет
//  - админская палочка (solve)                     → как успех, без аналитики
// «Получилось»/«Ещё раз» убраны: после неудачи микрофон просто остаётся доступным (число нажатий считаем для аналитики).
import { matchTop, tokenize } from './speechMatch.js'
import { matchStrict } from './sayConsensus.js'
import { pickReference } from './sayReading.js'
import { SAY_DONE, SAY_WRONG, SAY_CANT } from './sayTriggers.js'

export const TRIGGER_DONE = SAY_DONE
export const TRIGGER_WRONG = SAY_WRONG
export const TRIGGER_CANT = SAY_CANT
export const ALMOST_RATIO = 0.5 // не прошло, но слов не меньше половины → «Почти!»

/** kind: 'passed' (проверка прошла) | 'solve' (админ) | 'skip' («Я не могу говорить» / пропуск) | 'wrong' (три неудачные попытки) */
export function sayOutcome({ kind }) {
  if (kind === 'skip') return { result: 'skipped', success: false, penalty: false, trigger: TRIGGER_CANT }
  if (kind === 'wrong') return { result: 'wrong', success: false, penalty: false, trigger: TRIGGER_WRONG }
  return { result: 'success', success: true, penalty: false, trigger: TRIGGER_DONE }
}

/**
 * Сравнение услышанного с эталоном ноды; data — результат readSayData. Засчитываем ТОЛЬКО по главному варианту
 * распознавания (alts[0]): лучший из нескольких скрыл бы намеренную ошибку. В режиме «Строго» (data.strict) —
 * без допуска опечаток, с консенсусом interim+final (sayConsensus.js: слово, появившееся только в final, не засчитывается) И с правилом «первое увиденное»
 * (firstSeenRule.js по view.history: ошибочная форма держалась в interim дольше порога или стояла в конце речи — слово не засчитывается; порог — настройка админа sayDwell.js, по умолчанию 500 мс).
 * Остальные варианты (alternatives) нужны только админской строке.
 */
export function judgeRun(view, data) {
  const alts = (view?.alternatives?.length ? view.alternatives : view?.final ? [view.final] : [])
    .map(a => a.text).filter(Boolean)
  const ref = pickReference(data.phrase, alts[0] ?? '') // числа в эталоне: лучшее из допустимых прочтений (sayReading.js)
  const m = data.strict
    ? { ...matchStrict(ref, alts[0] ?? '', view?.lastInterim ?? '', view?.history ?? [], data.keywords, data.passRatio, { exactWords: true }), index: alts.length ? 0 : -1, text: alts[0] ?? '' }
    : { ...matchTop(ref, alts, data.keywords, data.passRatio), consensus: false, engineFixed: [] }
  return { ...m, ratioPct: Math.round(m.ratio * 100), heard: m.text ?? '' }
}

/** Движок «исправил» слово: последний промежуточный текст отличается от итогового (после нормализации). Для админской диагностики */
export function interimDiffers(lastInterim, finalText) {
  const a = tokenize(lastInterim).join(' ')
  const b = tokenize(finalText).join(' ')
  return !!a && !!b && a !== b
}

/**
 * Причина неудачи для подсказки и аналитики (без текста): silence — тишина, network — связь, partial — «почти» (≥50% слов,
 * но не прошло), mismatch — сказано не то; прочие коды ошибок движка возвращаются как есть.
 */
export function failReason({ errorCode = null, verdict = null } = {}) {
  if (errorCode) return errorCode === 'no-speech' || errorCode === 'silence' ? 'silence' : errorCode === 'network' ? 'network' : errorCode
  if (!verdict || verdict.passed) return null
  return verdict.ratio >= ALMOST_RATIO ? 'partial' : 'mismatch'
}

/** Свойства события аналитики. Только числа/строки/булевы — текста фразы и звука здесь нет */
export function sayEventProps({ perm, explained, taps, autoRetries, passed, ratioPct, reason, failStreak, interimDiffers: differs, engineFixed, hintKind, exhausted }) {
  const p = {}
  if (perm != null) p.perm = perm
  if (explained != null) p.explainer_shown = !!explained
  if (taps != null) p.attempts = taps
  if (autoRetries) p.auto_retries = autoRetries
  if (passed != null) p.passed = !!passed
  if (ratioPct != null) p.ratio = ratioPct
  if (reason) p.reason = reason
  if (failStreak) p.fail_streak = failStreak
  if (exhausted) p.exhausted = true // третья засчитанная неудача: урок уходит по ветке «неверный»
  if (hintKind) p.hint_kind = hintKind // какая подсказка ушла в чат: silence | mismatch | partial (нет подсказки — поля нет)
  if (differs != null) p.interim_differs = !!differs // без текста: только «движок исправил слово или нет»
  if (engineFixed) p.engine_fixed = engineFixed     // сколько слов подтвердил только final (строгий режим), числом
  return p
}

export const SAY_EVENTS = { start: 'say_phrase_start', result: 'say_phrase_result', skip: 'say_phrase_skip' }
