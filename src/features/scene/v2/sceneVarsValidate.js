import { isObj, LIMITS } from './sceneConstants.js'
import { VAR_LIMITS, VAR_PICKS, VAR_NAME_RE } from './sceneVars.js'

// Валидация vars сцены и segments реплик (формат и смысл — в sceneVars.js). Ошибки по-русски с путями
// (vars.food.pick, timeline[1].segments[0].var…). Смысловые проверки плейсхолдеров — sceneVarsLint.js.

export function validateVars(vars, errors) {
  if (vars === undefined) return
  if (!isObj(vars)) { errors.push('vars — объект { имя: { pick, fallback } }'); return }
  const names = Object.keys(vars)
  if (names.length > VAR_LIMITS.maxVars) errors.push(`vars — не больше ${VAR_LIMITS.maxVars} переменных (сейчас ${names.length})`)
  for (const name of names) {
    const p = `vars.${name}`
    if (!VAR_NAME_RE.test(name)) { errors.push(`${p} — имя переменной: латиница, цифры и _, 1–${VAR_LIMITS.maxName} символов`); continue }
    const v = vars[name]
    if (!isObj(v)) { errors.push(`${p} — объект { pick, fallback }`); continue }
    if (!VAR_PICKS.includes(v.pick)) errors.push(`${p}.pick — ${VAR_PICKS.join(' | ')}`)
    const fb = v.fallback
    if (!isObj(fb)) { errors.push(`${p}.fallback — обязательное запасное слово { text, translation? }`); continue }
    if (typeof fb.text !== 'string' || !fb.text.trim()) errors.push(`${p}.fallback.text — непустая строка (запасное слово)`)
    else if (fb.text.trim().length > VAR_LIMITS.maxWord) errors.push(`${p}.fallback.text — не длиннее ${VAR_LIMITS.maxWord} символов`)
    if (fb.translation !== undefined && typeof fb.translation !== 'string') errors.push(`${p}.fallback.translation — строка`)
    else if (typeof fb.translation === 'string' && fb.translation.trim().length > VAR_LIMITS.maxWord) errors.push(`${p}.fallback.translation — не длиннее ${VAR_LIMITS.maxWord} символов`)
  }
}

// segments реплики: [{ var } | { text?, audioUrl?, wordTimings?, audioMeta? }] — пока только структура
// (озвучка по сегментам — шаг 4–5); var должна быть объявлена в vars
export function validateSegments(segments, path, varNames, errors) {
  if (segments === undefined) return
  const p = `${path}.segments`
  if (!Array.isArray(segments) || !segments.length) { errors.push(`${p} — непустой массив сегментов`); return }
  if (segments.length > VAR_LIMITS.maxSegments) errors.push(`${p} — не больше ${VAR_LIMITS.maxSegments} сегментов`)
  segments.forEach((s, j) => {
    const q = `${p}[${j}]`
    if (!isObj(s)) { errors.push(`${q} — объект { var } или { text, audioUrl?, … }`); return }
    if (s.var !== undefined) {
      if (typeof s.var !== 'string' || !varNames.includes(s.var)) errors.push(`${q}.var — переменная '${s.var}' не объявлена в vars`)
      return
    }
    if (s.text !== undefined && typeof s.text !== 'string') errors.push(`${q}.text — строка`)
    else if (typeof s.text === 'string' && s.text.length > LIMITS.maxTextLen) errors.push(`${q}.text — не длиннее ${LIMITS.maxTextLen} символов`)
    if (s.audioUrl !== undefined && typeof s.audioUrl !== 'string') errors.push(`${q}.audioUrl — строка`)
    if (s.wordTimings !== undefined && !Array.isArray(s.wordTimings)) errors.push(`${q}.wordTimings — массив`)
    if (s.audioMeta !== undefined && !isObj(s.audioMeta)) errors.push(`${q}.audioMeta — объект`)
  })
}
