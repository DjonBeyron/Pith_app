import { phraseVariants } from '../../../shared/lib/phraseVariants.js'
import { readTimeLimit, TIME_LIMIT_MIN, TIME_LIMIT_MAX } from '../../../shared/lib/timeLimit.js'

const WRONG_OF = { word_choice: 'word_wrong', phrase_assembly: 'phrase_wrong' }

// Проверки новых полей: «Собери фразу» с несколькими верными ответами (answers) и лимит времени ответа (timeLimitSec) у
// «Выбери слово» и «Собери фразу». Формат обмена: { ref, type, data, triggers: [{ if, then }] }.
export function checkAnswersAndLimits(nodes) {
  const out = []
  for (const n of nodes) {
    const d = n.data ?? {}
    if (n.type === 'phrase_assembly' && Array.isArray(d.answers) && d.answers.length) {
      const main = phraseVariants({ words: d.words }).at(0) ?? []
      const all = phraseVariants(d)
      if (all.length - (main.length ? 1 : 0) < d.answers.length) out.push(`${n.ref} phrase_assembly: среди answers есть пустой ответ — он не учитывается`)
      const key = v => v.map(w => w.toLowerCase()).join(' ')
      const seen = new Set(main.length ? [key(main)] : [])
      for (const v of all.slice(main.length ? 1 : 0)) {
        if (seen.has(key(v))) out.push(`${n.ref} phrase_assembly: ответ «${v.join(' ')}» повторяется — лишний`)
        seen.add(key(v))
      }
      const used = new Set(all.flat().map(w => w.toLowerCase()))
      for (const t of d.distractors ?? []) {
        const text = String(t?.text ?? t ?? '').toLowerCase()
        if (text && used.has(text)) out.push(`${n.ref} phrase_assembly: ловушка «${text}» входит в один из верных ответов — это не ловушка, ученик не сможет её «ошибочно» выбрать`)
      }
    }
    if (d.timeLimitSec != null && Number(d.timeLimitSec) !== 0) { // 0 = без таймера
      if (!WRONG_OF[n.type]) {
        out.push(`${n.ref} ${n.type}: timeLimitSec поддерживают только word_choice и phrase_assembly — поле игнорируется`)
        continue
      }
      const sec = Number(d.timeLimitSec)
      if (readTimeLimit(sec) !== sec) out.push(`${n.ref} ${n.type}: timeLimitSec ${d.timeLimitSec} вне ${TIME_LIMIT_MIN}–${TIME_LIMIT_MAX} — будет подтянут к границе`)
      const wrong = (n.triggers ?? []).find(t => t.if === WRONG_OF[n.type])
      if (!wrong?.then) out.push(`${n.ref} ${n.type}: есть лимит времени, но выход ${WRONG_OF[n.type]} не соединён — «не успел» никуда не приведёт`)
    }
  }
  return out
}
