// Связь замечаний линтера с полями сборщика. Тексты sceneLint/sceneValidate начинаются
// с пути в сцене («timeline[3].text — …», «slots.desk-left — …», «characters.a.name — …»,
// «slots — …»); из него строится id элемента формы: f-timeline-3-text, f-slots-desk-left,
// f-characters-a-name, f-slots. Компоненты формы ставят такие id на свои поля/блоки.
// Если точного элемента нет (например, f-characters-a-palette-fur), ищется ближайший
// предок по пути (f-characters-a-palette → f-characters-a).
// Пути озвучки перевода и режимов (ядро sceneLint/sceneOptions) ведут к реальным id формы:
// timeline[i].translationAudioUrl → f-timeline-i-translationAudioUrl (LineVoiceControls set=translation),
// options.display → f-options-display, options.voice.translation → f-options-voice-translation,
// options.translationVoiceId → f-options-translationVoiceId (modes/PlaybackOptions),
// characters.a.voice.translationVoiceId → f-characters-a-voice-translationVoiceId (TranslationVoicePicker).
// Слова-переменные (VarsPanel): vars.food.pick → f-vars-food-pick, vars.food.fallback.text → f-vars-food-fallback-text (иначе f-vars-food → f-vars).
// Задание (SceneTaskSection): task.accept[1] → f-task-accept-1, task.answers[0] → f-task-answers-0, task.keywords[2] → f-task-keywords-2
// (иначе f-task-answers / f-task-keywords), task.passRatio → f-task-passRatio, task.strict → f-task-strict, task.lineIndex / prompt / hint.

const PATH_RE = /^([a-zA-Z]+(?:\[\d+\])?(?:\.[\w-]+(?:\[\d+\])?)*)/
const BUDGET_RE = /^Бюджет узлов/

export function lintPath(text) {
  if (BUDGET_RE.test(text)) return 'slots'
  const m = PATH_RE.exec(String(text ?? ''))
  if (!m) return null
  const path = m[1]
  // Отсекаем случайные слова: путь обязан начинаться с поля верхнего уровня
  const root = path.split(/[.[]/)[0]
  return ['version', 'id', 'title', 'location', 'characters', 'slots', 'timeline', 'options', 'task', 'vars'].includes(root) ? path : null
}

export function fieldId(path) {
  if (!path) return null
  return 'f-' + path.replace(/\[(\d+)\]/g, '-$1').replace(/\./g, '-')
}

// Цепочка кандидатов от точного к общему: f-timeline-3-text → f-timeline-3 → f-timeline
export function fieldIdCandidates(text) {
  const path = lintPath(text)
  if (!path) return []
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  const out = []
  for (let n = parts.length; n >= 1; n--) out.push('f-' + parts.slice(0, n).join('-'))
  return out
}

// Какая колонка/вкладка настроек содержит поле (для телефона: переключить вид)
export function fieldSection(text) {
  const path = lintPath(text)
  if (!path) return null
  const root = path.split(/[.[]/)[0]
  if (root === 'timeline') return 'timeline'
  if (root === 'characters') return 'characters'
  if (root === 'slots') return 'slots'
  if (root === 'task') return 'task'
  return 'scene'
}

// Первое найденное поле в DOM по кандидатам (doc — document; для тестов — заглушка с getElementById)
export function findField(text, doc) {
  for (const id of fieldIdCandidates(text)) {
    const el = doc?.getElementById?.(id)
    if (el) return el
  }
  return null
}
