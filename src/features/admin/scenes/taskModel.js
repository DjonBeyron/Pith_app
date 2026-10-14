import { normalizeTask, taskTargetLine, taskAnswers, taskPrompt, checkTaskAnswer, TASK_LIMITS } from '../../scene/v2/sceneTask.js'

// Модель секции «Задание после сцены» сборщика — чистые операции над сценой (как builderModel.js).
// Поле scene.task: нет → «Нет»; { kind: 'translate', … } → «Перевод». Все правки проходят через normalizeTask,
// чтобы черновик всегда был нормализованной сценой v2.

export const TASK_KIND_LABEL = { translate: 'Перевод' }

export function taskKind(scene) {
  return scene?.task?.kind ?? null
}

// Включить/выключить задание: kind null → поле убирается целиком
export function setTaskKind(scene, kind) {
  if (!kind) {
    if (!scene.task) return scene
    const { task: _t, ...rest } = scene
    return rest
  }
  const task = normalizeTask({ ...(scene.task ?? {}), kind })
  return task ? { ...scene, task } : scene
}

// Частичная правка задания (lineIndex, prompt, hint); пустые строки убирают поле
export function updateTask(scene, patch) {
  if (!scene.task) return scene
  const task = normalizeTask({ ...scene.task, ...patch })
  return task ? { ...scene, task } : scene
}

export function addAccept(scene, text = '') {
  if (!scene.task || scene.task.accept.length >= TASK_LIMITS.maxAccept) return scene
  // Добавляется только непустой текст (из поля «новый вариант» в UI): пустую строку нормализация всё равно выбросит
  const value = String(text ?? '').trim()
  if (!value) return scene
  return updateTask(scene, { accept: [...scene.task.accept, value] })
}

export function updateAccept(scene, index, text) {
  if (!scene.task || index < 0 || index >= scene.task.accept.length) return scene
  // Пустая строка остаётся в черновике (админ ещё печатает) — линтер подсветит, нормализация при загрузке выбросит
  const accept = scene.task.accept.map((a, i) => (i === index ? String(text ?? '').slice(0, TASK_LIMITS.maxAcceptLen) : a))
  return { ...scene, task: { ...scene.task, accept } }
}

export function removeAccept(scene, index) {
  if (!scene.task) return scene
  return updateTask(scene, { accept: scene.task.accept.filter((_, i) => i !== index) })
}

// Что увидит админ в тестере: целевая реплика, вопрос, эталоны и вердикт по введённому ответу
export function taskPreview(scene, input = '') {
  const target = scene?.task ? taskTargetLine(scene) : null
  if (!target) return null
  const answers = taskAnswers(scene.task, target.line)
  const prompt = taskPrompt(scene.task, scene, target.line)
  const result = input.trim() ? checkTaskAnswer(scene.task, target.line, input) : null
  return { index: target.index, line: target.line, answers, prompt, result }
}

// Подпись результата тестера по-русски
export function verdictText(result) {
  if (!result) return ''
  const pct = Math.round(result.score * 100)
  if (result.ok) return `✓ Засчитается (совпало ${pct}% ключевых слов${result.missingKeys.length ? `, не хватило: ${result.missingKeys.join(', ')}` : ''})`
  if (result.empty) return '✗ Пустой ответ не засчитывается'
  return `✗ Не засчитается (совпало ${pct}%, нужно ≥ 70%)${result.missingKeys.length ? ` — не хватает: ${result.missingKeys.join(', ')}` : ''}`
}
