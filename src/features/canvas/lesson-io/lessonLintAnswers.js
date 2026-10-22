import { phraseVariants } from '../../../shared/lib/phraseVariants.js'
import { readTimeLimit, TIME_LIMIT_MIN, TIME_LIMIT_MAX } from '../../../shared/lib/timeLimit.js'

const WRONG_OF = { word_choice: 'word_wrong', phrase_assembly: 'phrase_wrong' }
// Личные местоимения (подлежащее и дополнение): сбивает именно похожее по роли слово, а не случайное
const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'])
const wordsOf = list => (list ?? []).flatMap(w => String(w?.text ?? w ?? '').toLowerCase().split(/\s+/)).map(w => w.replace(/[^a-z']/g, '')).filter(Boolean)

// Проверки новых полей: «Собери фразу» с несколькими верными ответами (answers) и лимит времени ответа (timeLimitSec) у
// «Выбери слово» и «Собери фразу». Формат обмена: { ref, type, data, triggers: [{ if, then }] }.
export function checkAnswersAndLimits(nodes) {
  const out = []
  for (const n of nodes) {
    const d = n.data ?? {}
    if (n.type === 'phrase_assembly' && Array.isArray(d.answers) && d.answers.length) {
      const main = phraseVariants({ words: d.words }).at(0) ?? []
      const all = phraseVariants(d)
      if (all.length - (main.length ? 1 : 0) < d.answers.length) out.push(`[R-answers] ${n.ref} phrase_assembly: среди answers есть пустой ответ — он не учитывается`)
      const key = v => v.map(w => w.toLowerCase()).join(' ')
      const seen = new Set(main.length ? [key(main)] : [])
      for (const v of all.slice(main.length ? 1 : 0)) {
        if (seen.has(key(v))) out.push(`[R-answers] ${n.ref} phrase_assembly: ответ «${v.join(' ')}» повторяется — лишний`)
        seen.add(key(v))
      }
      const used = new Set(all.flat().map(w => w.toLowerCase()))
      for (const t of d.distractors ?? []) {
        const text = String(t?.text ?? t ?? '').toLowerCase()
        if (text && used.has(text)) out.push(`[R-answers] ${n.ref} phrase_assembly: ловушка «${text}» входит в один из верных ответов — это не ловушка, ученик не сможет её «ошибочно» выбрать`)
      }
    }
    // [R-pronoun-trap] в сборке есть местоимение → среди ловушек обязательно ДРУГОЕ местоимение (I want → she/we), а не только «too/traveling»
    if (n.type === 'phrase_assembly' && wordsOf(d.words).some(w => PRONOUNS.has(w))) {
      const have = new Set(wordsOf(d.words))
      if (!wordsOf(d.distractors).some(w => PRONOUNS.has(w) && !have.has(w))) {
        out.push(`[R-pronoun-trap] ${n.ref} phrase_assembly: в фразе есть местоимение, а среди ловушек нет другого местоимения — добавь, например, she / we / they`)
      }
    }
    if (d.timeLimitSec != null && Number(d.timeLimitSec) !== 0) { // 0 = без таймера
      if (!WRONG_OF[n.type]) {
        out.push(`[R-time-limit] ${n.ref} ${n.type}: timeLimitSec поддерживают только word_choice и phrase_assembly — поле игнорируется`)
        continue
      }
      const sec = Number(d.timeLimitSec)
      if (readTimeLimit(sec) !== sec) out.push(`[R-time-limit] ${n.ref} ${n.type}: timeLimitSec ${d.timeLimitSec} вне ${TIME_LIMIT_MIN}–${TIME_LIMIT_MAX} — будет подтянут к границе`)
      const wrong = (n.triggers ?? []).find(t => t.if === WRONG_OF[n.type])
      if (!wrong?.then) out.push(`[R-time-limit] ${n.ref} ${n.type}: есть лимит времени, но выход ${WRONG_OF[n.type]} не соединён — «не успел» никуда не приведёт`)
    }
  }
  return out
}
