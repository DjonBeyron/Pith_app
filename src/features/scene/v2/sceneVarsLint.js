import { isObj, LIMITS } from './sceneConstants.js'
import { VAR_LIMITS, tokenizeTemplate, usesVars } from './sceneVars.js'

// Линтер слов-переменных (дополняет sceneValidate: формат vars/segments проверен там). Плейсхолдеры:
// объявлена ли переменная, правильный ли вид ({name} в тексте, {name:ru} в переводе), лишние скобки,
// длина реплики в худшем случае, запрет плейсхолдеров в задании, неиспользуемые переменные.
// Худший случай: каждое слово занимает VAR_LIMITS.maxWord символов (запасное слово и слово памяти — до 40).

const err = text => ({ level: 'error', text })
const warn = text => ({ level: 'warn', text })

// Длина строки в худшем случае: литералы + 40 символов на каждый плейсхолдер
export function worstLength(str) {
  return tokenizeTemplate(str).reduce((n, t) => n + (t.name ? VAR_LIMITS.maxWord : (t.lit ?? t.stray).length), 0)
}

// Реплика шаблонная: в text/translation есть плейсхолдер или у неё есть segments
export function isTemplateLine(l) {
  if (!isObj(l)) return false
  return Array.isArray(l.segments) || [l.text, l.translation].some(s => tokenizeTemplate(s).some(t => t.name))
}

function lintField(str, field, path, declared, used, out) {
  if (typeof str !== 'string') return
  const tokens = tokenizeTemplate(str)
  const hasVars = tokens.some(t => t.name)
  for (const t of tokens) {
    if (t.name) {
      used.add(t.name)
      if (!declared.includes(t.name)) out.push(err(`${path}.${field} — плейсхолдер {${t.name}}: переменной '${t.name}' нет в vars`))
      else if (field === 'translation' && !t.ru) out.push(err(`${path}.translation — слово-перевод пишется {${t.name}:ru}; {${t.name}} в переводе — слово оригинала`))
      else if (field === 'text' && t.ru) out.push(err(`${path}.text — {${t.name}:ru} (перевод слова) допустим только в translation, в тексте пишите {${t.name}}`))
    } else if (t.stray) out.push(err(`${path}.${field} — одиночная фигурная скобка «${t.stray}»: литеральные скобки пишутся {{ и }}`))
  }
  if (hasVars && worstLength(str) > LIMITS.maxTextLen) {
    out.push(err(`${path}.${field} — со словом-переменной реплика может не уместиться в ${LIMITS.maxTextLen} символов (худший случай ${worstLength(str)}: на каждое слово запас ${VAR_LIMITS.maxWord})`))
  }
}

function lintTaskVars(task, out) {
  if (!isObj(task)) return
  for (const f of ['accept', 'answers']) {
    const list = Array.isArray(task[f]) ? task[f] : []
    list.forEach((s, i) => {
      if (typeof s === 'string' && tokenizeTemplate(s).some(t => t.name)) out.push(err(`task.${f}[${i}] — в задании нельзя плейсхолдеры слов-переменных: ответ должен быть один и тот же`))
    })
  }
}

export function lintVars(scene, out) {
  if (!isObj(scene)) return
  const tl = Array.isArray(scene.timeline) ? scene.timeline : []
  const declared = isObj(scene.vars) ? Object.keys(scene.vars) : []
  const used = new Set()
  const templated = usesVars(scene)
  tl.forEach((l, i) => {
    if (!isObj(l)) return
    const p = `timeline[${i}]`
    if (Array.isArray(l.segments)) l.segments.forEach(g => { if (isObj(g) && typeof g.var === 'string') used.add(g.var) })
    // Без vars одиночные скобки — обычный текст (старые сцены не трогаем); плейсхолдеры без vars — всё равно ошибка
    const onlyVars = (str, field) => (templated || tokenizeTemplate(str).some(t => t.name) ? lintField(str, field, p, declared, used, out) : null)
    onlyVars(l.text, 'text')
    onlyVars(l.translation, 'translation')
    if (templated && isTemplateLine(l) && l.audioUrl) out.push(warn(`${p}.audioUrl — реплика со словом-переменной: озвучка целой реплики не используется (слово подставляется, озвучка по сегментам — позже)`))
  })
  for (const name of declared) if (!used.has(name)) out.push(warn(`vars.${name} — переменная объявлена, но не используется в репликах`))
  lintTaskVars(scene.task, out)
}
