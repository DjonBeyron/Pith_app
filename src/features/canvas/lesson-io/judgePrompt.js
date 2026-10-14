// Промпт ИИ-судьи: отдельный вызов с чистым контекстом проверяет готовый урок по правилам, которые НЕ ловит линтер.
// Чистая функция, без React. Судья не видел, как урок писали, поэтому не склонен соглашаться с автором.
import { rulesSection, checklistSection } from './authorPrompt.js'

/** Правила для судьи: активные, кроме тех, что целиком проверяет линтер (checker === 'auto') */
export const judgeRules = rules => rules.filter(r => r.checker !== 'auto')

export function buildJudgePrompt(rules, lessonJson) {
  const { text, count } = rulesSection(judgeRules(rules))
  const checklist = checklistSection(judgeRules(rules))
  return `Ты строгий проверяющий уроков Pithy. Ты НЕ автор и не видел, как урок писали. Твоя задача — найти нарушения правил, а не хвалить.

Проверь урок (JSON ниже) по каждому правилу R1…R${count}${checklist ? ' и пункту чек-листа' : ''}. Выделения в тексте могут быть записаны разметкой {g:..} {w:..} {u:..} {b:..} {p:..} — это нормально.

ПРАВИЛА:

${text}
${checklist ? `\nЧЕК-ЛИСТ:\n${checklist}\n` : ''}
ОТВЕТ — только JSON-массив, по одному объекту на правило, без текста вокруг:
[{"rule":"R1","ok":true|false,"nodes":["ref","ref"],"quote":"короткая цитата из урока или пусто","fix":"что изменить, одним предложением или пусто"}]
Если не уверен — ok:false с пометкой в fix «проверь вручную». Не придумывай нарушений, которых нет; не пропускай правила.

УРОК:
${typeof lessonJson === 'string' ? lessonJson : JSON.stringify(lessonJson)}
`
}

/** Из ответа судьи достаёт список нарушений (ok:false). Терпит обёртку ```json и лишний текст */
export function parseVerdict(answer) {
  const m = String(answer ?? '').match(/\[[\s\S]*\]/)
  if (!m) return { ok: false, error: 'нет JSON-массива', violations: [] }
  try {
    const arr = JSON.parse(m[0])
    return { ok: true, violations: arr.filter(v => v && v.ok === false) }
  } catch (e) { return { ok: false, error: e.message, violations: [] } }
}
