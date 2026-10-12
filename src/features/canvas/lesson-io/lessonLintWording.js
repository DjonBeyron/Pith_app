// Проверки формулировок реплик Пита: кавычки, подчёркнутое время, «ещё раз» в ветке ошибки, однообразная открывашка «почти».
// Чистые функции на формате обмена ({ ref, type, data, triggers }) после applyMarkup (текст без меток, раскраска в highlights).
import { wrongOnlySet } from './lessonLintFlow.js'

const ERR = /wrong|skip/ // только ветки ошибки/пропуска (меню «variant» — не ошибка)
const textOf = n => String(n.data?.content ?? n.data?.text ?? n.data?.caption ?? '')
const talks = nodes => nodes.filter(n => n.type === 'text' && textOf(n).trim())
const covered = (n, a, b, mode) => (n.data?.highlights ?? []).some(h => h.mode === mode && h.start <= a && h.end >= b)

const QUOTED = /«([^»]*)»/g
/** Кавычки «…» нужны только у перевода ({t:«…»}, курсив); русские термины и слова без кавычек, белым жирным {w:} */
function checkQuotes(nodes) {
  const wrong = wrongOnlySet(nodes, ERR)
  const out = []
  for (const n of talks(nodes)) {
    const t = textOf(n)
    for (const m of t.matchAll(QUOTED)) {
      if (wrong.has(n.ref) || !covered(n, m.index, m.index + m[0].length, 'italic')) {
        out.push(`[R-quotes] ${n.ref}: «${m[1]}» в кавычках, но это не перевод — убери кавычки и выдели слово белым жирным {w:..} (кавычки только у перевода: {t:«..»}; в подсказках ветки ошибки кавычек нет совсем)`)
        break
      }
    }
  }
  return out
}

const TENSE = /настоящ[а-яё]*\s+время|прошедш[а-яё]*\s+время|будущ[а-яё]*\s+время|прямо сейчас|в настоящем|в прошлом|в будущем/i
/** Всякий раз, когда в реплике названо время, оно подчёркнуто ({u:..}: голубой, жирный, подчёркивание) */
function checkTense(nodes) {
  return talks(nodes).filter(n => {
    const m = TENSE.exec(textOf(n))
    return m && !covered(n, m.index, m.index + m[0].length, 'underline')
  }).map(n => `[R-tense] ${n.ref}: названо время (настоящее/прошедшее/будущее/«прямо сейчас»), но оно не подчёркнуто — оберни в {u:..}`)
}

const RETRY = /ещё раз|еще раз|попробуй ещё|попробуй еще|повтори/i
/** В ветке ошибки не просят «ещё раз»: урок идёт дальше, повторов нет — подскажи, что поправить */
function checkRetry(nodes) {
  const wrong = wrongOnlySet(nodes, ERR)
  return talks(nodes).filter(n => wrong.has(n.ref) && RETRY.test(textOf(n)) && !/\bразок\b/.test(textOf(n)))
    .map(n => `[R-retry] ${n.ref}: в подсказке просят «ещё раз», а урок идёт дальше и повторов нет — скажи, что нужно ввести/сказать (напр. «не совсем) нужно сказать I'm и слово fine»)`)
}

const ALMOST = /^почти/i
const MAX_ALMOST = 0.35
/** Открывашка «почти» не больше трети подсказок: чередуй «не совсем», «близко», «но нет», «не то», «хм» */
function checkWording(nodes) {
  const wrong = wrongOnlySet(nodes, ERR)
  const hints = talks(nodes).filter(n => wrong.has(n.ref))
  if (hints.length < 5) return []
  const almost = hints.filter(n => ALMOST.test(textOf(n).trim()))
  const share = almost.length / hints.length
  return share > MAX_ALMOST
    ? [`[R-wording] «почти» открывает ${Math.round(share * 100)}% подсказок (${almost.slice(0, 5).map(n => n.ref).join(', ')}…), нужно не больше ${MAX_ALMOST * 100}% — чередуй «не совсем», «близко», «но нет», «не то», «хм»`]
    : []
}

export function checkWordingRules(nodes) {
  return [...checkQuotes(nodes), ...checkTense(nodes), ...checkRetry(nodes), ...checkWording(nodes)]
}
