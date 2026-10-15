import { voicePreview } from './taskModelVoice.js'
import { normalizeTask, taskTargetLine, taskAnswers, taskPrompt, checkTaskAnswer, TASK_LIMITS } from '../../scene/v2/sceneTask.js'

// Модель секции «Задание после сцены» сборщика — чистые операции над сценой (как builderModel.js).
// Поле scene.task: нет → «Нет»; kind translate → «Перевод» (пишет по-русски), say → «Ответь коту» (отвечает вслух своими
// словами: answers/keywords/accept), repeat → «Повтори за диктором» (повторяет реплику вслух: эталон — её text + accept).
// Все правки проходят через normalizeTask, чтобы черновик всегда был нормализованной сценой v2.
// Голосовой тестер (чистая логика, checkSpeechAnswer) — taskModelVoice.js.

export const TASK_KIND_LABEL = { translate: 'Перевод', say: 'Ответь коту', repeat: 'Повтори за диктором' }
export const VOICE_KINDS = ['say', 'repeat']
export const isVoiceKind = kind => VOICE_KINDS.includes(kind)

// Списки строк в задании: максимум и длина элемента (значения ядра; запасные — по контракту: answers ≤8×140, keywords ≤12)
export const TASK_LISTS = {
  accept: { max: TASK_LIMITS.maxAccept, len: TASK_LIMITS.maxAcceptLen },
  answers: { max: TASK_LIMITS.maxAnswers ?? 8, len: TASK_LIMITS.maxAnswerLen ?? 140 },
  keywords: { max: TASK_LIMITS.maxKeywords ?? 12, len: TASK_LIMITS.maxKeywordLen ?? 40 },
}

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

// Частичная правка задания (lineIndex, prompt, hint, passRatio, strict…); пустые строки убирают поле
export function updateTask(scene, patch) {
  if (!scene.task) return scene
  const task = normalizeTask({ ...scene.task, ...patch })
  return task ? { ...scene, task } : scene
}

// Общие операции над списком строк задания (accept | answers | keywords)
export function addItem(scene, field, text = '') {
  const rule = TASK_LISTS[field]
  if (!scene.task || !rule) return scene
  const cur = Array.isArray(scene.task[field]) ? scene.task[field] : []
  // Добавляется только непустой текст (из поля «новый …» в UI): пустую строку нормализация всё равно выбросит
  const value = String(text ?? '').trim().slice(0, rule.len)
  if (!value || cur.length >= rule.max || cur.includes(value)) return scene
  return updateTask(scene, { [field]: [...cur, value] })
}

export function updateItem(scene, field, index, text) {
  const rule = TASK_LISTS[field]
  const cur = scene.task?.[field]
  if (!rule || !Array.isArray(cur) || index < 0 || index >= cur.length) return scene
  // Пустая строка остаётся в черновике (админ ещё печатает) — линтер подсветит, нормализация при загрузке выбросит
  return { ...scene, task: { ...scene.task, [field]: cur.map((a, i) => (i === index ? String(text ?? '').slice(0, rule.len) : a)) } }
}

export function removeItem(scene, field, index) {
  const cur = scene.task?.[field]
  if (!TASK_LISTS[field] || !Array.isArray(cur)) return scene
  return updateTask(scene, { [field]: cur.filter((_, i) => i !== index) })
}

export const addAccept = (scene, text = '') => addItem(scene, 'accept', text)
export const updateAccept = (scene, index, text) => updateItem(scene, 'accept', index, text)
export const removeAccept = (scene, index) => removeItem(scene, 'accept', index)

// Что увидит админ в тестере: целевая реплика, вопрос, эталоны и вердикт по введённому ответу
export function taskPreview(scene, input = '') {
  if (isVoiceKind(scene?.task?.kind)) return voicePreview(scene, input)
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
