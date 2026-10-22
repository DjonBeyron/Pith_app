// Промпт ИИ-судьи: отдельный вызов с чистым контекстом проверяет готовый урок по правилам, которые НЕ ловит линтер.
// Чистая функция, без React. Судья не видел, как урок писали, поэтому не склонен соглашаться с автором.
// Судья по группам (PROJECT.md «Порядок в правилах»): один вызов — одна группа правил (≤ 30), иначе на сотне правил судья теряет
// «правила по всему уроку». Чек-лист — своя группа «Чек-лист». Справка по модулям (category reference) судье не идёт
import { rulesSection, checklistSection } from './authorPrompt.js'
import { groupOf } from './ruleMeta.js'

export const CHECKLIST_GROUP = 'Чек-лист'

/** Правила для судьи: активные, кроме тех, что целиком проверяет линтер (checker === 'auto') и справки по модулям */
export const judgeRules = rules => rules.filter(r => r.checker !== 'auto' && r.category !== 'reference')

/** Группы, по которым судью запускают отдельно: группы принципов + «Чек-лист» */
export function judgeGroups(rules) {
  const list = judgeRules(rules).filter(r => r.active)
  const groups = [...new Set(list.filter(r => r.category === 'principle').map(groupOf))]
  if (list.some(r => r.category === 'checklist')) groups.push(CHECKLIST_GROUP)
  return groups
}

/** Правила одной группы (или все, если group не задан) */
export function rulesForGroup(rules, group) {
  const list = judgeRules(rules)
  if (!group) return list
  if (group === CHECKLIST_GROUP) return list.filter(r => r.category === 'checklist')
  return list.filter(r => r.category === 'principle' && groupOf(r) === group)
}

export function buildJudgePrompt(rules, lessonJson, { group = '' } = {}) {
  const scoped = rulesForGroup(rules, group)
  const { text, count } = rulesSection(scoped, { full: true })
  const checklist = checklistSection(scoped)
  const scope = group ? `Сейчас проверяется только группа «${group}»${count ? ` (R1…R${count})` : ''} — другие правила урока тебя не касаются.` : ''
  return `Ты строгий проверяющий уроков Pithy. Ты НЕ автор и не видел, как урок писали. Твоя задача — найти нарушения правил, а не хвалить.

Проверь урок (JSON ниже) по каждому правилу${count ? ` R1…R${count}` : ''}${checklist ? ' и пункту чек-листа' : ''}. ${scope} Выделения в тексте могут быть записаны разметкой {g:..} {w:..} {u:..} {b:..} {p:..} — это нормально.

ПРАВИЛА:

${text}
${checklist ? `\nЧЕК-ЛИСТ:\n${checklist}\n` : ''}
ОТВЕТ — только JSON-массив, по одному объекту на правило${checklist ? ' и пункт чек-листа (C1…)' : ''}, без текста вокруг:
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
