import { taskTargetLine, taskPrompt, PASS_RATIO } from '../../scene/v2/sceneTask.js'
import { taskExpectedPhrases, checkSpeechAnswer } from '../../scene/v2/sceneTaskVoice.js'

// Голосовой тестер секции «Задание после сцены» (kind say | repeat) — чистая логика без React.
// Админ вводит текстом то, что «распознал» бы микрофон, и видит вердикт ядра (checkSpeechAnswer):
// ✓/✗, долю совпадения, чего не хватило и ближайший эталон. Строка передаётся как единственная гипотеза распознавания.

export const SPEECH_PASS_DEFAULT = PASS_RATIO ?? 0.7
export const RATIO_MIN = 0.5
export const RATIO_MAX = 1

// Порог засчитывания для показа: passRatio задания или значение по умолчанию (0.7 — как в уроке)
export const taskRatio = task => (typeof task?.passRatio === 'number' ? task.passRatio : SPEECH_PASS_DEFAULT)

// Целевая реплика, вопрос панели, эталоны и вердикт по введённой «речи»
export function voicePreview(scene, said = '') {
  const task = scene?.task
  const target = task ? taskTargetLine(scene) : null
  if (!target) return null
  const expected = taskExpectedPhrases(task, target.line) ?? []
  const prompt = taskPrompt(task, scene, target.line)
  const text = String(said ?? '').trim()
  const result = text ? checkSpeechAnswer(task, target.line, [text]) : null
  return { index: target.index, line: target.line, answers: expected, prompt, result, voice: true, ratio: taskRatio(task) }
}

const list = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [])

// Подпись вердикта по-русски. Поля результата: ok, score 0..1, missingKeys | missing (чего не хватило)
export function speechVerdictText(result, ratio = SPEECH_PASS_DEFAULT) {
  if (!result) return ''
  const pct = Math.round((result.score ?? 0) * 100)
  const missing = list(result.missingKeys ?? result.missing)
  if (result.ok) return `✓ Засчитается (совпало ${pct}%${missing.length ? `, не хватило: ${missing.join(', ')}` : ''})`
  if (result.empty) return '✗ Пустая речь не засчитывается'
  return `✗ Не засчитается (совпало ${pct}%, нужно ≥ ${Math.round(ratio * 100)}%)${missing.length ? ` — не хватает: ${missing.join(', ')}` : ''}`
}

// Ближайший эталон из результата ядра (если ядро его вернуло)
export function nearestReference(result) {
  const v = result?.matchedAnswer ?? result?.best ?? result?.reference
  return typeof v === 'string' && v ? v : null
}
